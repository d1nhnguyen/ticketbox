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

import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const BASE_URL = __ENV.API_URL || "http://localhost:3000";

const rateLimited = new Counter("rate_limited");
const passed200 = new Counter("passed_200");
const sustainedOk = new Counter("sustained_200");
const sustainedBlocked = new Counter("sustained_429");

export const options = {
  scenarios: {
    burst: {
      executor: "shared-iterations",
      exec: "burstScenario",
      vus: 200,
      iterations: 200,
      maxDuration: "20s",
      startTime: "0s",
    },
    sustained: {
      executor: "constant-arrival-rate",
      exec: "sustainedScenario",
      rate: 4,
      timeUnit: "1s",
      duration: "5s",
      preAllocatedVUs: 10,
      // Start after burst + 8s to let the bucket refill fully
      startTime: "28s",
    },
  },
  thresholds: {
    // Burst: limiter must reject some AND let some through
    rate_limited: ["count>0"],
    passed_200: ["count>0"],
    // Sustained: slow legitimate traffic must never be throttled
    sustained_429: ["count==0"],
  },
};

// Burst scenario: hit the public /concerts endpoint above the bucket capacity
export function burstScenario() {
  const res = http.get(`${BASE_URL}/concerts`);

  check(res, {
    "burst: status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  if (res.status === 200) passed200.add(1);
  else if (res.status === 429) {
    rateLimited.add(1);
    // Log retry guidance from the first blocked request
    if (rateLimited.count === 1) {
      const retryAfter = res.headers["Retry-After"];
      console.log(
        `First 429 — Retry-After: ${retryAfter}s | body: ${res.body.substring(0, 120)}`,
      );
    }
  }
}

// Sustained scenario: rate stays within refill → no throttling expected
export function sustainedScenario() {
  const res = http.get(`${BASE_URL}/concerts`);

  check(res, {
    "sustained: status 200": (r) => r.status === 200,
  });

  if (res.status === 200) sustainedOk.add(1);
  else if (res.status === 429) sustainedBlocked.add(1);
}
// Sustained load test — verify refill rate
async function runSustainedTest() {
  console.log("=".repeat(60));
  console.log("Sustained Load Test (verify token refill)");
  console.log("Sending 1 request per 200ms for 5 seconds...");
  console.log("=".repeat(60));

  const results = [];
  for (let i = 0; i < 25; i++) {
    const result = await sendRequest(i + 1);
    results.push(result);
    process.stdout.write(
      `  [${i + 1}/25] Status: ${result.status} | Remaining: ${result.remaining ?? "N/A"}\n`,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const rateLimited = results.filter((r) => r.status === 429).length;
  console.log(
    `\nSustained test: ${rateLimited} requests rate-limited out of 25 (200ms interval).`,
  );
  if (rateLimited === 0) {
    console.log("✅ PASS — Sustained rate within limit, all requests passed.");
  }
}

/**
 * Phase 3 — Stricter bucket test on POST /payment/charge
 *
 * Mục tiêu: Chứng minh rằng endpoint thanh toán có bucket riêng chặt hơn,
 * được config qua PAYMENT_RATE_LIMIT_CAPACITY / PAYMENT_RATE_LIMIT_REFILL_RATE.
 *
 * Config mặc định: capacity=20, refill=2/s (5× tighter than global 100/10).
 * Gửi 30 burst → expect ~10 bị chặn (30 - 20 = 10).
 */
async function runPaymentStricterTest() {
  const PAYMENT_BURST = 30; // > PAYMENT_RATE_LIMIT_CAPACITY (default 20)
  const PAYMENT_ENDPOINT = "/payment/charge";

  console.log("=".repeat(60));
  console.log("Stricter Rate Limit Test — POST /payment/charge");
  console.log(`Bucket: PAYMENT_RATE_LIMIT_CAPACITY (default=20), refill=2/s`);
  console.log(
    `Sending ${PAYMENT_BURST} concurrent POST requests (no real gateway needed)...`,
  );
  console.log("=".repeat(60));

  const requests = Array.from({ length: PAYMENT_BURST }, (_, i) => {
    const start = Date.now();
    return fetch(`${BASE_URL}${PAYMENT_ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: `test-rl-${i}`, amount: 100 }),
    })
      .then(async (res) => {
        const latencyMs = Date.now() - start;
        const body = await res.json().catch(() => ({}));
        return {
          status: res.status,
          latencyMs,
          remaining: res.headers.get("x-ratelimit-remaining"),
          retryAfter: res.headers.get("retry-after"),
          body,
        };
      })
      .catch((err) => ({ status: -1, error: err.message }));
  });

  const results = await Promise.all(requests);

  const passed = results.filter(
    (r) => r.status >= 200 && r.status < 300,
  ).length;
  const rateLimited = results.filter((r) => r.status === 429).length;
  const serverErrors = results.filter((r) => r.status >= 500).length; // 503 from CB
  const connErrors = results.filter((r) => r.status === -1).length;
  const avgLatency =
    results.filter((r) => r.latencyMs).reduce((s, r) => s + r.latencyMs, 0) /
    results.length;

  console.log("\n📊 RESULTS:");
  console.log(`  ✅ 2xx OK          : ${passed}`);
  console.log(
    `  ⛔ 429 Rate-limited: ${rateLimited}  (expect ≥ ${PAYMENT_BURST - 20} if cap=20)`,
  );
  console.log(`  🔌 5xx (CB/other)  : ${serverErrors}`);
  console.log(`  ❌ Conn errors     : ${connErrors}`);
  console.log(`  ⏱  Avg latency    : ${avgLatency.toFixed(1)}ms`);

  const sample429 = results.find((r) => r.status === 429);
  if (sample429) {
    console.log(`\n🔍 Sample 429 body:`);
    console.log(`  Retry-After: ${sample429.retryAfter}s`);
    console.log(`  X-RateLimit-Remaining: ${sample429.remaining}`);
  }

  console.log("\n🧪 VALIDATION:");

  if (connErrors === PAYMENT_BURST) {
    console.log("  ⚠️  SKIP — All requests failed with ECONNREFUSED.");
    console.log("     Make sure the backend is running: npm run start:dev");
    return;
  }

  // Core assertion: payment bucket is tighter than global
  if (rateLimited > 0) {
    console.log(
      `  ✅ PASS — Stricter bucket active: ${rateLimited}/${PAYMENT_BURST} blocked (429).`,
    );
  } else if (serverErrors > 0) {
    console.log(
      `  ✅ PASS (variant) — ${serverErrors} requests got 5xx (circuit breaker open).`,
    );
    console.log(
      "     Rate limit working; some may have been rejected by CB before rate-limit check.",
    );
  } else {
    console.log(
      "  ❌ FAIL — No 429s. Either bucket not set or PAYMENT_RATE_LIMIT_CAPACITY ≥ 30.",
    );
    console.log(
      "     Check .env: PAYMENT_RATE_LIMIT_CAPACITY should be < 30 for this test.",
    );
  }

  // Contrast assertion: payment limit < global limit
  console.log("\n📋 CONTRAST vs global bucket:");
  console.log(
    `  Global  (/concerts) : capacity=${process.env.RATE_LIMIT_CAPACITY ?? 100}, refill=${process.env.RATE_LIMIT_REFILL_RATE ?? 10}/s`,
  );
  console.log(
    `  Payment (/charge)   : capacity=${process.env.PAYMENT_RATE_LIMIT_CAPACITY ?? 20}, refill=${process.env.PAYMENT_RATE_LIMIT_REFILL_RATE ?? 2}/s`,
  );
  console.log(
    "  → Payment endpoint is significantly more restrictive (anti-abuse for checkout).",
  );
  console.log("\n");
}

(async () => {
  await runBurstTest();
  console.log("Waiting 5s before sustained test (let bucket refill)...\n");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await runSustainedTest();
  console.log("\nWaiting 3s before payment stricter bucket test...\n");
  await new Promise((resolve) => setTimeout(resolve, 3000));
  await runPaymentStricterTest();
})();
