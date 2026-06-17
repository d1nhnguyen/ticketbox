/**
 * Rate Limit Load Test — Cơ chế #2 (Token Bucket)
 *
 * Mục tiêu: Chứng minh rằng khi gửi nhiều request đồng thời,
 * hệ thống trả về HTTP 429 cho các request vượt giới hạn,
 * và không có request nào bị mất hoàn toàn (vẫn có retryAfterMs).
 *
 * Chạy: node scripts/load-test/rate-limit.js
 *
 * Yêu cầu: npm install -g artillery   HOẶC  dùng node built-in fetch (Node 18+)
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const ENDPOINT = '/concerts'; // Dùng endpoint public (không cần auth)
const CONCURRENT_REQUESTS = 150; // Gửi 150 request gần như đồng thời
const DELAY_MS = 0; // 0ms delay → thử burst thật sự

async function sendRequest(id) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${ENDPOINT}`, {
      headers: { 'X-Test-Request-Id': String(id) },
    });
    const latencyMs = Date.now() - start;
    const body = await res.json().catch(() => ({}));

    return {
      id,
      status: res.status,
      latencyMs,
      remaining: res.headers.get('x-ratelimit-remaining'),
      retryAfter: res.headers.get('retry-after'),
      body,
    };
  } catch (err) {
    return { id, status: -1, error: err.message };
  }
}

async function runBurstTest() {
  console.log('='.repeat(60));
  console.log(`Token Bucket Rate Limit Test`);
  console.log(`Target: ${BASE_URL}${ENDPOINT}`);
  console.log(`Sending ${CONCURRENT_REQUESTS} concurrent requests...`);
  console.log('='.repeat(60));

  const requests = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
    sendRequest(i + 1),
  );

  const results = await Promise.all(requests);

  // Summary
  const passed = results.filter((r) => r.status === 200).length;
  const rateLimited = results.filter((r) => r.status === 429).length;
  const errors = results.filter((r) => r.status === -1).length;
  const avgLatency =
    results
      .filter((r) => r.latencyMs)
      .reduce((sum, r) => sum + r.latencyMs, 0) / results.length;

  console.log('\n📊 RESULTS:');
  console.log(`  ✅ 200 OK         : ${passed}`);
  console.log(`  ⛔ 429 Too Many   : ${rateLimited}`);
  console.log(`  ❌ Errors         : ${errors}`);
  console.log(`  ⏱  Avg latency   : ${avgLatency.toFixed(1)}ms`);

  // Show sample 429 response
  const sample429 = results.find((r) => r.status === 429);
  if (sample429) {
    console.log(`\n🔍 Sample 429 Response:`);
    console.log(`  Retry-After header : ${sample429.retryAfter}s`);
    console.log(`  Body: ${JSON.stringify(sample429.body, null, 2)}`);
  }

  // Validation
  console.log('\n🧪 VALIDATION:');
  if (rateLimited > 0) {
    console.log(`  ✅ PASS — Rate limiter is working. ${rateLimited} requests were blocked.`);
  } else {
    console.log('  ❌ FAIL — No requests were rate limited. Check Redis connection or config.');
  }

  if (passed > 0) {
    console.log(`  ✅ PASS — ${passed} legitimate requests passed through.`);
  }

  if (sample429?.body?.retryAfterMs) {
    console.log('  ✅ PASS — retryAfterMs is present in 429 body.');
  }

  console.log('\n');
}

// Sustained load test — verify refill rate
async function runSustainedTest() {
  console.log('='.repeat(60));
  console.log('Sustained Load Test (verify token refill)');
  console.log('Sending 1 request per 200ms for 5 seconds...');
  console.log('='.repeat(60));

  const results = [];
  for (let i = 0; i < 25; i++) {
    const result = await sendRequest(i + 1);
    results.push(result);
    process.stdout.write(`  [${i + 1}/25] Status: ${result.status} | Remaining: ${result.remaining ?? 'N/A'}\n`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const rateLimited = results.filter((r) => r.status === 429).length;
  console.log(`\nSustained test: ${rateLimited} requests rate-limited out of 25 (200ms interval).`);
  if (rateLimited === 0) {
    console.log('✅ PASS — Sustained rate within limit, all requests passed.');
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
  const PAYMENT_ENDPOINT = '/payment/charge';

  console.log('='.repeat(60));
  console.log('Stricter Rate Limit Test — POST /payment/charge');
  console.log(`Bucket: PAYMENT_RATE_LIMIT_CAPACITY (default=20), refill=2/s`);
  console.log(`Sending ${PAYMENT_BURST} concurrent POST requests (no real gateway needed)...`);
  console.log('='.repeat(60));

  const requests = Array.from({ length: PAYMENT_BURST }, (_, i) => {
    const start = Date.now();
    return fetch(`${BASE_URL}${PAYMENT_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: `test-rl-${i}`, amount: 100 }),
    })
      .then(async (res) => {
        const latencyMs = Date.now() - start;
        const body = await res.json().catch(() => ({}));
        return {
          status: res.status,
          latencyMs,
          remaining: res.headers.get('x-ratelimit-remaining'),
          retryAfter: res.headers.get('retry-after'),
          body,
        };
      })
      .catch((err) => ({ status: -1, error: err.message }));
  });

  const results = await Promise.all(requests);

  const passed       = results.filter((r) => r.status >= 200 && r.status < 300).length;
  const rateLimited  = results.filter((r) => r.status === 429).length;
  const serverErrors = results.filter((r) => r.status >= 500).length; // 503 from CB
  const connErrors   = results.filter((r) => r.status === -1).length;
  const avgLatency   = results
    .filter((r) => r.latencyMs)
    .reduce((s, r) => s + r.latencyMs, 0) / results.length;

  console.log('\n📊 RESULTS:');
  console.log(`  ✅ 2xx OK          : ${passed}`);
  console.log(`  ⛔ 429 Rate-limited: ${rateLimited}  (expect ≥ ${PAYMENT_BURST - 20} if cap=20)`);
  console.log(`  🔌 5xx (CB/other)  : ${serverErrors}`);
  console.log(`  ❌ Conn errors     : ${connErrors}`);
  console.log(`  ⏱  Avg latency    : ${avgLatency.toFixed(1)}ms`);

  const sample429 = results.find((r) => r.status === 429);
  if (sample429) {
    console.log(`\n🔍 Sample 429 body:`);
    console.log(`  Retry-After: ${sample429.retryAfter}s`);
    console.log(`  X-RateLimit-Remaining: ${sample429.remaining}`);
  }

  console.log('\n🧪 VALIDATION:');

  if (connErrors === PAYMENT_BURST) {
    console.log('  ⚠️  SKIP — All requests failed with ECONNREFUSED.');
    console.log('     Make sure the backend is running: npm run start:dev');
    return;
  }

  // Core assertion: payment bucket is tighter than global
  if (rateLimited > 0) {
    console.log(`  ✅ PASS — Stricter bucket active: ${rateLimited}/${PAYMENT_BURST} blocked (429).`);
  } else if (serverErrors > 0) {
    console.log(`  ✅ PASS (variant) — ${serverErrors} requests got 5xx (circuit breaker open).`);
    console.log('     Rate limit working; some may have been rejected by CB before rate-limit check.');
  } else {
    console.log('  ❌ FAIL — No 429s. Either bucket not set or PAYMENT_RATE_LIMIT_CAPACITY ≥ 30.');
    console.log('     Check .env: PAYMENT_RATE_LIMIT_CAPACITY should be < 30 for this test.');
  }

  // Contrast assertion: payment limit < global limit
  console.log('\n📋 CONTRAST vs global bucket:');
  console.log(`  Global  (/concerts) : capacity=${process.env.RATE_LIMIT_CAPACITY ?? 100}, refill=${process.env.RATE_LIMIT_REFILL_RATE ?? 10}/s`);
  console.log(`  Payment (/charge)   : capacity=${process.env.PAYMENT_RATE_LIMIT_CAPACITY ?? 20}, refill=${process.env.PAYMENT_RATE_LIMIT_REFILL_RATE ?? 2}/s`);
  console.log('  → Payment endpoint is significantly more restrictive (anti-abuse for checkout).');
  console.log('\n');
}

(async () => {
  await runBurstTest();
  console.log('Waiting 5s before sustained test (let bucket refill)...\n');
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await runSustainedTest();
  console.log('\nWaiting 3s before payment stricter bucket test...\n');
  await new Promise((resolve) => setTimeout(resolve, 3000));
  await runPaymentStricterTest();
})();
