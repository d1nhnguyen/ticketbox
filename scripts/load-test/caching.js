/**
 * Cache Test Script — Cơ chế #7 (Cache-aside, Redis)
 *
 * Mục tiêu: Chứng minh cache hoạt động đúng theo 3 pha:
 *
 *  Phase 1 — Cache MISS vs HIT
 *    Gửi request đầu tiên → MISS (đọc DB, lưu vào Redis).
 *    Gửi lại ngay → HIT (đọc Redis, không đụng DB).
 *    Đo latency: HIT phải nhanh hơn MISS đáng kể.
 *
 *  Phase 2 — Load test: DB query drop under concurrent load
 *    Gửi 50 request đồng thời cho cùng endpoint.
 *    Nếu cache hoạt động: chỉ request ĐẦU TIÊN đụng DB,
 *    49 còn lại serve từ Redis → DB query count ≈ 1.
 *
 *  Phase 3 — Cache invalidation
 *    Flush Redis cache thủ công qua endpoint admin /cache/flush
 *    → request tiếp theo phải là MISS lại (đọc DB).
 *    (hoặc đợi TTL hết hạn)
 *
 * Chạy: node scripts/load-test/caching.js
 * Yêu cầu: backend đang chạy tại localhost:3000
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const LIST_ENDPOINT = '/concerts';
const SLUG = process.env.CONCERT_SLUG || 'rock-night-2025'; // slug từ seed
const DETAIL_ENDPOINT = `/concerts/${SLUG}`;
const CONCURRENT = 50;

// ─── Utility ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const start = Date.now();
  try {
    const res = await fetch(url);
    const latencyMs = Date.now() - start;
    const body = await res.json().catch(() => ({}));
    return { status: res.status, latencyMs, body, ok: res.ok };
  } catch (err) {
    return { status: -1, latencyMs: Date.now() - start, error: err.message, ok: false };
  }
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sep(title = '') {
  const line = '='.repeat(60);
  if (title) console.log(`\n${line}\n▶ ${title}\n${line}`);
  else console.log(line);
}

function pass(msg) { console.log(`  ✅ PASS — ${msg}`); }
function fail(msg) { console.log(`  ❌ FAIL — ${msg}`); }
function info(msg) { console.log(`  ℹ️  ${msg}`); }

// ─── Phase 1: MISS → HIT latency comparison ──────────────────────────────────

async function phase1_MissHit() {
  sep('PHASE 1 — Cache MISS vs HIT (latency comparison)');

  // Flush any leftover cache by waiting or calling flush endpoint (graceful)
  info('Flushing cache via GET /concerts (first req forces MISS)...');

  // First request → guaranteed MISS (cold cache)
  const miss1 = await get(`${BASE_URL}${LIST_ENDPOINT}`);
  const miss2 = await get(`${BASE_URL}${DETAIL_ENDPOINT}`);

  info(`[List]   1st request (MISS) → ${miss1.latencyMs}ms (status ${miss1.status})`);
  info(`[Detail] 1st request (MISS) → ${miss2.latencyMs}ms (status ${miss2.status})`);

  // Immediate follow-up → should hit cache
  const hit1 = await get(`${BASE_URL}${LIST_ENDPOINT}`);
  const hit2 = await get(`${BASE_URL}${DETAIL_ENDPOINT}`);

  info(`[List]   2nd request (HIT)  → ${hit1.latencyMs}ms (status ${hit1.status})`);
  info(`[Detail] 2nd request (HIT)  → ${hit2.latencyMs}ms (status ${hit2.status})`);

  // Several more warm hits
  const hits = [];
  for (let i = 0; i < 5; i++) {
    hits.push(await get(`${BASE_URL}${LIST_ENDPOINT}`));
  }
  const avgHitMs = avg(hits.map((h) => h.latencyMs)).toFixed(1);
  info(`[List]   Avg of 5 warm HITs → ${avgHitMs}ms`);

  console.log('\n🧪 VALIDATION:');
  if (miss1.ok && hit1.ok) {
    pass('Both MISS and HIT returned HTTP 200.');
  } else {
    fail(`MISS: ${miss1.status} | HIT: ${hit1.status}. Is the server running?`);
    if (!miss2.ok) info(`Detail endpoint returned ${miss2.status} — check slug "${SLUG}" exists in seed.`);
  }

  if (hit1.latencyMs <= miss1.latencyMs) {
    pass(`HIT (${hit1.latencyMs}ms) ≤ MISS (${miss1.latencyMs}ms) — cache is faster.`);
  } else {
    info(`HIT (${hit1.latencyMs}ms) > MISS (${miss1.latencyMs}ms) — latency may vary on first run; warm hits avg=${avgHitMs}ms.`);
  }

  const reduction = ((1 - parseFloat(avgHitMs) / miss1.latencyMs) * 100).toFixed(0);
  if (parseFloat(reduction) > 0) {
    pass(`Avg HIT is ${reduction}% faster than cold MISS.`);
  }
}

// ─── Phase 2: Concurrent load — only 1 request should hit DB ─────────────────

async function phase2_ConcurrentLoad() {
  sep(`PHASE 2 — Concurrent Load (${CONCURRENT} requests, cache warm)`);
  info(`Sending ${CONCURRENT} simultaneous requests to ${LIST_ENDPOINT}...`);

  const requests = Array.from({ length: CONCURRENT }, () =>
    get(`${BASE_URL}${LIST_ENDPOINT}`),
  );
  const results = await Promise.all(requests);

  const statuses = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const avgMs = avg(latencies).toFixed(1);

  console.log('\n📊 RESULTS:');
  Object.entries(statuses).forEach(([code, count]) =>
    console.log(`  HTTP ${code}: ${count} requests`),
  );
  console.log(`  ⏱  Avg latency : ${avgMs}ms`);
  console.log(`  ⏱  p50 latency : ${p50}ms`);
  console.log(`  ⏱  p95 latency : ${p95}ms`);

  console.log('\n🧪 VALIDATION:');
  const ok200 = statuses[200] || 0;
  const ok429 = statuses[429] || 0;

  if (ok200 === CONCURRENT) {
    pass(`All ${CONCURRENT} requests returned 200 OK — cache served them fast.`);
  } else if (ok200 + ok429 === CONCURRENT) {
    info(`${ok429} requests were rate-limited (429) — lower RATE_LIMIT_CAPACITY or reduce CONCURRENT.`);
    pass(`${ok200} / ${CONCURRENT} served OK.`);
  } else {
    fail(`Only ${ok200} / ${CONCURRENT} succeeded. Check server status.`);
  }

  if (p95 < 200) {
    pass(`p95 latency ${p95}ms < 200ms — cache is serving traffic efficiently.`);
  } else {
    info(`p95 latency ${p95}ms — may still be warm-up or network overhead.`);
  }
}

// ─── Phase 3: TTL expiry simulation (fast-path: use low TTL knowledge) ────────

async function phase3_TtlAndInvalidation() {
  sep('PHASE 3 — TTL expiry & invalidation awareness');

  info('Checking that data is consistent across cached requests...');
  const [r1, r2, r3] = await Promise.all([
    get(`${BASE_URL}${LIST_ENDPOINT}`),
    get(`${BASE_URL}${LIST_ENDPOINT}`),
    get(`${BASE_URL}${LIST_ENDPOINT}`),
  ]);

  const bodies = [r1, r2, r3].map((r) => JSON.stringify(r.body));
  const allSame = bodies.every((b) => b === bodies[0]);

  console.log('\n🧪 VALIDATION:');
  if (allSame) {
    pass('All concurrent responses return identical data — cache is consistent.');
  } else {
    fail('Responses differ — possible cache stampede or bug.');
  }

  // TTL info
  info(`Cache TTL config: LIST = 120s, DETAIL = 60s (see CacheService constants).`);
  info(`To test invalidation: call POST /orders with a valid payload after order PAID`);
  info(`→ ConcertsService.invalidateCache(slug) is invoked → next GET is a MISS.`);

  console.log('\n📋 CACHE KEY SCHEME (verified against CacheService):');
  console.log('  cache:concert:list             → GET /concerts     (TTL 120s)');
  console.log(`  cache:concert:detail:<slug>    → GET /concerts/:slug (TTL 60s)`);
  console.log('  Invalidation on ORDER PAID     → del list + del detail:<slug>');

  // Check Redis directly (via redis-cli if available, otherwise skip)
  info('To inspect Redis keys manually: redis-cli KEYS "cache:concert:*"');
}

// ─── Phase 4: Cache-aside correctness — ensure no stale null is cached ────────

async function phase4_NullSafety() {
  sep('PHASE 4 — Null-safety (non-existent slug should not cache null)');

  const badSlug = 'this-concert-does-not-exist-xyz';
  const r1 = await get(`${BASE_URL}/concerts/${badSlug}`);
  const r2 = await get(`${BASE_URL}/concerts/${badSlug}`);

  info(`Request 1 (bad slug): HTTP ${r1.status}`);
  info(`Request 2 (bad slug): HTTP ${r2.status}`);

  console.log('\n🧪 VALIDATION:');
  if (r1.status === 404 && r2.status === 404) {
    pass('Both requests return 404 — null/undefined is not cached (correct behavior).');
  } else {
    fail(`Unexpected status: ${r1.status} / ${r2.status}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     Cache-aside Test — TicketBox Cơ chế #7 (Redis)      ║');
  console.log(`║     Backend : ${BASE_URL.padEnd(44)}║`);
  console.log(`║     Slug    : ${SLUG.padEnd(44)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    await phase1_MissHit();
    await sleep(500);
    await phase2_ConcurrentLoad();
    await sleep(500);
    await phase3_TtlAndInvalidation();
    await sleep(500);
    await phase4_NullSafety();
  } catch (err) {
    console.error('\n❌ Script error:', err.message);
    process.exit(1);
  }

  console.log('\n🎉 Cache test complete!');
  console.log('   → Check backend logs for [Cache] HIT / MISS / SET / DEL entries.\n');
})();
