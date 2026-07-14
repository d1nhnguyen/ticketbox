/**
 * Oversell Load Test — Mechanism #1
 *
 * Proves: 100 concurrent buyers competing for 50 SVIP tickets →
 *   - Exactly ≤ 50 succeed (no oversell)
 *   - remainingQty ends at exactly 0, never negative
 *
 * Run: k6 run scripts/load-test/oversell.js
 * Reseed first: (from src/backend) FORCE_SEED=1 npm run seed
 */

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Gauge } from 'k6/metrics';

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const STOCK = parseInt(__ENV.STOCK || '50', 10);

const purchaseOk = new Counter('purchase_ok');
const purchaseSoldOut = new Counter('purchase_soldout');
const finalRemaining = new Gauge('final_remaining_qty');

export const options = {
  scenarios: {
    rush: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 100,
      maxDuration: '30s',
    },
  },
  thresholds: {
    // Core correctness invariants — if either fails, k6 exits non-zero
    purchase_ok: [`count<=${STOCK}`],       // never oversell
    final_remaining_qty: ['value>=0'],       // never negative stock
  },
};

export function setup() {
  // Login once — login endpoint is rate-limited (cap 5/IP), never do it per-VU
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'audience@ticketbox.dev', password: 'password123' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (loginRes.status !== 201) {
    throw new Error(`Login failed: ${loginRes.status} ${loginRes.body}`);
  }
  const { access_token } = loginRes.json();

  // Fetch ticket type IDs dynamically — they are random UUIDs, not fixed
  const concertRes = http.get(`${BASE_URL}/concerts/anh-trai-say-hi`);
  if (concertRes.status !== 200) {
    throw new Error(`Concert fetch failed: ${concertRes.status}`);
  }
  const concert = concertRes.json();
  const svip = concert.ticketTypes.find((t) => t.name === 'SVIP');
  if (!svip) throw new Error('SVIP ticket type not found — did you reseed?');

  console.log(
    `SVIP: id=${svip.id} totalQty=${svip.totalQty} remainingQty=${svip.remainingQty}`,
  );
  if (svip.remainingQty < svip.totalQty) {
    console.warn(
      `⚠ Stock is partially sold (${svip.remainingQty}/${svip.totalQty}). ` +
      `Run: (from src/backend) FORCE_SEED=1 npm run seed`,
    );
  }

  return { token: access_token, ticketTypeId: svip.id, initialRemaining: svip.remainingQty };
}

export default function (data) {
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
    'status is 201 or 409': (r) => r.status === 201 || r.status === 409,
  });

  if (res.status === 201) purchaseOk.add(1);
  else if (res.status === 409) purchaseSoldOut.add(1);
}

export function teardown(data) {
  // Verify DB state via API (caching not active → reads live DB)
  const concertRes = http.get(`${BASE_URL}/concerts/anh-trai-say-hi`);
  const concert = concertRes.json();
  const svip = concert.ticketTypes.find((t) => t.name === 'SVIP');

  if (svip) {
    finalRemaining.add(svip.remainingQty);
    console.log(`Final remainingQty = ${svip.remainingQty} (expect 0 on a full run)`);
    if (svip.remainingQty < 0) {
      console.error('❌ OVERSELL DETECTED — remainingQty is negative!');
    } else if (svip.remainingQty === 0) {
      console.log('✅ Stock exactly exhausted, no oversell.');
    }
  }
}
