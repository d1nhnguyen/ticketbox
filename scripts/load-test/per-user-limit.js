/**
 * Per-User Limit Load Test — Mechanism #6
 *
 * Proves: 10 concurrent buy requests from ONE account (VIP, maxPerUser=4) →
 *   - Exactly ≤ 4 succeed
 *   - The rest are blocked with HTTP 400 (per-user limit exceeded)
 *
 * Run: k6 run scripts/load-test/per-user-limit.js
 * Reseed first: (from src/backend) FORCE_SEED=1 npm run seed
 */

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const MAX_PER_USER = parseInt(__ENV.MAX_PER_USER || '4', 10);
const NUM_REQUESTS = 10;

const purchaseOk = new Counter('purchase_ok');
const limitBlocked = new Counter('limit_blocked');

export const options = {
  scenarios: {
    concurrent_same_user: {
      executor: 'shared-iterations',
      vus: NUM_REQUESTS,
      iterations: NUM_REQUESTS,
      maxDuration: '30s',
    },
  },
  thresholds: {
    // Hard invariant: one account must never exceed maxPerUser
    purchase_ok: [`count<=${MAX_PER_USER}`],
    // The limit must actually fire — if nobody is blocked, the mechanism isn't working
    limit_blocked: ['count>0'],
  },
};

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'audience@ticketbox.dev', password: 'password123' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (loginRes.status !== 201) {
    throw new Error(`Login failed: ${loginRes.status} ${loginRes.body}`);
  }
  const { access_token } = loginRes.json();

  const concertRes = http.get(`${BASE_URL}/concerts/anh-trai-say-hi`);
  if (concertRes.status !== 200) {
    throw new Error(`Concert fetch failed: ${concertRes.status}`);
  }
  const concert = concertRes.json();
  const vip = concert.ticketTypes.find((t) => t.name === 'VIP');
  if (!vip) throw new Error('VIP ticket type not found — did you reseed?');

  console.log(`VIP: id=${vip.id} maxPerUser=${vip.maxPerUser} remainingQty=${vip.remainingQty}`);

  return {
    token: access_token,
    ticketTypeId: vip.id,
    maxPerUser: vip.maxPerUser,
  };
}

export default function (data) {
  // All VUs share the same token → same user account → per-user limit applies
  const idempotencyKey = `vu${__VU}-iter${__ITER}-${Date.now()}`;
  const res = http.post(
    `${BASE_URL}/orders`,
    JSON.stringify({ ticketTypeId: data.ticketTypeId, quantity: 1 }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.token}`,
        'Idempotency-Key': idempotencyKey,
      },
    },
  );

  check(res, {
    'status is 201 or 400': (r) => r.status === 201 || r.status === 400,
  });

  if (res.status === 201) purchaseOk.add(1);
  else if (res.status === 400) limitBlocked.add(1);
}

export function teardown(data) {
  // purchase_ok and limit_blocked are logged automatically in k6 threshold summary.
  // A passing run on a fresh seed shows: purchase_ok=4, limit_blocked=6.
  console.log(
    `maxPerUser configured: ${data.maxPerUser} | ` +
    `Expected: purchase_ok==${data.maxPerUser}, limit_blocked==${NUM_REQUESTS - data.maxPerUser}`,
  );
}
