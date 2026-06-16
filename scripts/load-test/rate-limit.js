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

(async () => {
  await runBurstTest();
  console.log('Waiting 5s before sustained test (let bucket refill)...\n');
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await runSustainedTest();
})();
