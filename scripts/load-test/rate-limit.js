/**
 * Rate Limit Load Test — Mechanism #2 (Token Bucket)
 *
 * Two scenarios:
 *   burst     — 200 concurrent requests → excess get 429, some 200s still pass
 *   sustained — 4 req/s for 5s (< 10/s refill rate) → all should be 200
 *
 * Run: k6 run scripts/load-test/rate-limit.js
 * No reseed needed — targets a public, read-only endpoint.
 */

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

const rateLimited = new Counter('rate_limited');
const passed200 = new Counter('passed_200');
const sustainedOk = new Counter('sustained_200');
const sustainedBlocked = new Counter('sustained_429');

export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations',
      exec: 'burstScenario',
      vus: 200,
      iterations: 200,
      maxDuration: '20s',
      startTime: '0s',
    },
    sustained: {
      executor: 'constant-arrival-rate',
      exec: 'sustainedScenario',
      rate: 4,
      timeUnit: '1s',
      duration: '5s',
      preAllocatedVUs: 10,
      // Start after burst + 8s to let the bucket refill fully
      startTime: '28s',
    },
  },
  thresholds: {
    // Burst: limiter must reject some AND let some through
    rate_limited: ['count>0'],
    passed_200: ['count>0'],
    // Sustained: slow legitimate traffic must never be throttled
    sustained_429: ['count==0'],
  },
};

// Burst scenario: hit the public /concerts endpoint above the bucket capacity
export function burstScenario() {
  const res = http.get(`${BASE_URL}/concerts`);

  check(res, {
    'burst: status 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  if (res.status === 200) passed200.add(1);
  else if (res.status === 429) {
    rateLimited.add(1);
    // Log retry guidance from the first blocked request
    if (rateLimited.count === 1) {
      const retryAfter = res.headers['Retry-After'];
      console.log(`First 429 — Retry-After: ${retryAfter}s | body: ${res.body.substring(0, 120)}`);
    }
  }
}

// Sustained scenario: rate stays within refill → no throttling expected
export function sustainedScenario() {
  const res = http.get(`${BASE_URL}/concerts`);

  check(res, {
    'sustained: status 200': (r) => r.status === 200,
  });

  if (res.status === 200) sustainedOk.add(1);
  else if (res.status === 429) sustainedBlocked.add(1);
}
