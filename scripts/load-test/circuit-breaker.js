#!/usr/bin/env node
/**
 * Circuit Breaker Demo Script — Cơ chế #3
 *
 * Mục tiêu: chứng minh 3 hành vi của Circuit Breaker:
 *   1. CLOSED  → Gateway hoạt động bình thường, mọi request đều pass
 *   2. OPEN    → Sau nhiều lỗi liên tiếp, circuit mở, request trả về fallback ngay lập tức
 *   3. HALF-OPEN → Sau reset timeout, circuit thử 1 request để kiểm tra recovery
 *
 * Chạy: node scripts/load-test/circuit-breaker.js
 *
 * Hỗ trợ 2 chế độ:
 *   - Có gateway (port 4000): full demo CLOSED→OPEN→HALF-OPEN→CLOSED
 *   - Không có gateway (port 4000 tắt): demo OPEN via ECONNREFUSED
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function isGatewayAlive() {
  try {
    const res = await fetch(`${GATEWAY_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function setGatewayMode(mode) {
  try {
    const res = await fetch(`${GATEWAY_URL}/admin/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
      signal: AbortSignal.timeout(2000),
    });
    const body = await res.json();
    console.log(`  [Gateway] Mode set to "${mode}" → ${body.message}`);
    return true;
  } catch {
    console.log(`  [Gateway] ⚠ Cannot reach gateway — running in offline mode`);
    return false;
  }
}

async function chargePayment(orderId, amount) {
  try {
    const res = await fetch(`${API_URL}/payment/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, amount }),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } catch (err) {
    return { status: -1, body: {}, error: err.message };
  }
}

async function getCircuitStatus() {
  try {
    const res = await fetch(`${API_URL}/payment/status`);
    return res.json();
  } catch {
    return { state: 'UNKNOWN', stats: { fires: 0, failures: 0, successes: 0, timeouts: 0, rejects: 0, fallbacks: 0 } };
  }
}

async function resetCircuitBreaker(maxRetries = 5) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      const res = await fetch(`${API_URL}/payment/reset`, { method: 'POST', signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const body = await res.json();
        console.log(`  [CB Reset] ${body.message} → state=${body.state}`);
        return true;
      }
    } catch { /* ignore, retry */ }
    if (i < maxRetries) {
      console.log(`  [CB Reset] Waiting for backend... (attempt ${i}/${maxRetries})`);
      await sleep(1000);
    }
  }
  console.log('  [CB Reset] ⚠ Could not reset — backend may not have the reset endpoint yet. Restart backend if needed.');
  return false;
}

async function getConcerts() {
  try {
    const res = await fetch(`${API_URL}/concerts`);
    return { status: res.status };
  } catch {
    return { status: -1 };
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function log(msg) { console.log(`  ${msg}`); }
function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`▶ ${title}`);
  console.log('='.repeat(60));
}

// ─── Phases ───────────────────────────────────────────────────────────────────

async function testClosed() {
  section('PHASE 1 — CLOSED state (gateway healthy)');
  await setGatewayMode('success');

  let allOk = true;
  for (let i = 1; i <= 3; i++) {
    const result = await chargePayment(`order-${i}`, 500000);
    const ok = result.status >= 200 && result.status < 300;
    if (!ok) allOk = false;
    log(`  Charge #${i}: HTTP ${result.status} | status=${result.body.status ?? result.body.message ?? 'n/a'}`);
  }

  const cb = await getCircuitStatus();
  log(`\n  Circuit state: ${cb.state}`);
  log(`  Stats: fires=${cb.stats.fires}, successes=${cb.stats.successes}, failures=${cb.stats.failures}`);

  if (allOk) {
    console.log('\n  ✅ PASS — All requests succeeded when gateway is healthy');
  } else {
    console.log('\n  ℹ Some requests failed (circuit may already be tripping from a previous run — re-seed if needed)');
  }
}

async function testTripping() {
  section('PHASE 2 — Tripping the circuit (gateway failing)');
  await setGatewayMode('failure');
  log('Gateway set to FAILURE mode. Sending 8 requests to trip the breaker...\n');

  for (let i = 1; i <= 8; i++) {
    const result = await chargePayment(`order-fail-${i}`, 100000);
    const cb = await getCircuitStatus();
    log(`  Request #${i}: HTTP ${result.status} | payStatus="${result.body.status ?? 'n/a'}" | breaker=${cb.state}`);
    await sleep(200);
  }

  const cb = await getCircuitStatus();
  log(`\n  Final circuit state: ${cb.state}`);
  log(`  Stats: fires=${cb.stats.fires}, failures=${cb.stats.failures}, rejects=${cb.stats.rejects}`);

  if (cb.state === 'OPEN') {
    console.log('\n  ✅ PASS — Circuit OPENED after repeated failures');
  } else {
    console.log(`\n  ⚠ Circuit is ${cb.state}. May need more failures or lower volumeThreshold.`);
  }
}

async function testOfflineGateway() {
  section('PHASE 2 (OFFLINE) — Tripping circuit via ECONNREFUSED (gateway completely off)');
  log('Gateway is DOWN (port 4000 not reachable). Sending requests until circuit opens...\n');

  let openedAt = -1;
  for (let i = 1; i <= 10; i++) {
    const result = await chargePayment(`order-offline-${i}`, 100000);
    const cb = await getCircuitStatus();
    const stateLabel = cb.state === 'OPEN' ? '🔴 OPEN' : cb.state === 'HALF-OPEN' ? '🟡 HALF-OPEN' : '🟢 CLOSED';
    log(`  Request #${i}: HTTP ${result.status} | breaker=${stateLabel}`);
    if (cb.state === 'OPEN' && openedAt === -1) openedAt = i;
    await sleep(300);
  }

  const cb = await getCircuitStatus();
  log(`\n  Final circuit state: ${cb.state}`);
  log(`  Stats: fires=${cb.stats.fires}, failures=${cb.stats.failures}, rejects=${cb.stats.rejects}, timeouts=${cb.stats.timeouts}`);

  if (cb.state === 'OPEN') {
    console.log('\n  ✅ PASS — Circuit OPENED after ECONNREFUSED errors (gateway completely offline)');
    if (openedAt > 0) log(`  Circuit opened after request #${openedAt}`);
  } else {
    console.log(`\n  ⚠ Circuit is ${cb.state}. volumeThreshold may need more requests.`);
  }
}

async function testGracefulDegradation() {
  section('PHASE 3 — Graceful degradation (circuit OPEN, browsing still works)');
  log('Checking that concerts listing still works while payment is down...\n');

  const concerts = await getConcerts();
  log(`  GET /concerts: HTTP ${concerts.status}`);

  const payResult = await chargePayment('order-open', 200000);
  log(`  POST /payment/charge: HTTP ${payResult.status}`);
  if (payResult.body && Object.keys(payResult.body).length > 0) {
    log(`  Payment response: ${JSON.stringify(payResult.body, null, 2).split('\n').join('\n    ')}`);
  }

  const concertOk = concerts.status === 200;
  const payFallback = payResult.status === 503;

  if (concertOk && payFallback) {
    console.log('\n  ✅ PASS — Graceful degradation: listing works (200), payment returns 503 fallback');
  } else if (concertOk) {
    console.log('\n  ℹ Listing works. Payment circuit may not be OPEN yet — run Phase 2 first.');
  } else {
    console.log('\n  ❌ FAIL — Listing endpoint also failing. Backend may be down.');
  }
}

async function testRecovery() {
  section('PHASE 4 — Recovery (HALF-OPEN → CLOSED)');
  const cb = await getCircuitStatus();
  log(`  Current breaker state: ${cb.state}`);

  if (cb.state !== 'OPEN') {
    log('  Circuit is not OPEN. Skipping recovery test.');
    return;
  }

  const resetTimeoutMs = 10000;
  log(`  Waiting ${resetTimeoutMs / 1000 + 1}s for opossum reset timeout → HALF-OPEN...`);
  await sleep(resetTimeoutMs + 1000);

  const cbAfterWait = await getCircuitStatus();
  log(`  State after wait: ${cbAfterWait.state}`);

  const restored = await setGatewayMode('success');
  if (restored) {
    log('  Gateway restored to SUCCESS mode. Sending probes...');
  } else {
    log('  Gateway still offline. HALF-OPEN probe will fail → circuit stays OPEN.');
  }

  // opossum allows 1 probe in HALF-OPEN. Send a few to ensure we catch the state transition.
  for (let i = 1; i <= 3; i++) {
    const result = await chargePayment(`order-recovery-${i}`, 300000);
    const st = await getCircuitStatus();
    log(`  Probe #${i}: HTTP ${result.status} | breaker=${st.state}`);
    await sleep(500);
    if (st.state === 'CLOSED') break; // recovered!
  }

  const finalState = await getCircuitStatus();
  log(`\n  Final circuit state: ${finalState.state}`);
  log(`  Stats: fires=${finalState.stats.fires}, successes=${finalState.stats.successes}, failures=${finalState.stats.failures}`);

  if (finalState.state === 'CLOSED') {
    console.log('\n  ✅ PASS — Circuit CLOSED — gateway fully recovered');
  } else if (finalState.state === 'HALF-OPEN') {
    console.log('\n  ✅ PASS (partial) — Circuit is HALF-OPEN (still probing recovery)');
  } else {
    console.log('\n  ℹ Circuit still OPEN — gateway not restored or probe failed (expected if gateway is offline)');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n🔌 Circuit Breaker Demo — TicketBox Mechanism #3');
  console.log(`   Backend : ${API_URL}`);
  console.log(`   Gateway : ${GATEWAY_URL}`);

  // Detect if gateway is reachable
  const gatewayAlive = await isGatewayAlive();
  if (gatewayAlive) {
    console.log('   Mode    : FULL DEMO (gateway is online — testing HTTP failure mode)');
  } else {
    console.log('   Mode    : OFFLINE DEMO (gateway is DOWN — testing ECONNREFUSED mode)');
  }

  try {
    // ---- Always reset CB to CLOSED before starting demo ----
    console.log('\n🔄 Resetting circuit breaker to CLOSED state...');
    await resetCircuitBreaker();
    await sleep(300);

    if (gatewayAlive) {
      // Full demo: gateway controls the failure mode
      await testClosed();
      await sleep(1000);
      await testTripping();
    } else {
      // Offline demo: ECONNREFUSED trips the breaker
      await testOfflineGateway();
    }

    await sleep(500);
    await testGracefulDegradation();
    await testRecovery();

    console.log('\n\n🎉 Demo complete! Check the backend logs to see state transitions.');
    const final = await getCircuitStatus();
    console.log(`   Final state: ${final.state} | fires=${final.stats.fires} failures=${final.stats.failures} rejects=${final.stats.rejects}`);
  } catch (err) {
    console.error('\n❌ Unexpected error:', err.message);
    console.error('   Make sure backend (port 3000) is running.');
  }
})();
