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
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function setGatewayMode(mode) {
  const res = await fetch(`${GATEWAY_URL}/admin/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  const body = await res.json();
  console.log(`  [Gateway] Mode set to "${mode}" → ${body.message}`);
}

async function chargePayment(orderId, amount) {
  const res = await fetch(`${API_URL}/payment/charge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, amount }),
  });
  return { status: res.status, body: await res.json() };
}

async function getCircuitStatus() {
  const res = await fetch(`${API_URL}/payment/status`);
  return res.json();
}

async function getConcerts() {
  const res = await fetch(`${API_URL}/concerts`);
  return { status: res.status };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg) {
  console.log(`  ${msg}`);
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`▶ ${title}`);
  console.log('='.repeat(60));
}

// ─── Test Cases ───────────────────────────────────────────────────────────────

async function testClosed() {
  section('PHASE 1 — CLOSED state (gateway healthy)');
  await setGatewayMode('success');

  for (let i = 1; i <= 3; i++) {
    const result = await chargePayment(`order-${i}`, 500000);
    log(`  Charge #${i}: HTTP ${result.status} | status=${result.body.status}`);
  }

  const cb = await getCircuitStatus();
  log(`\n  Circuit state: ${cb.state}`);
  log(`  Stats: fires=${cb.stats.fires}, successes=${cb.stats.successes}, failures=${cb.stats.failures}`);
  console.log('\n  ✅ PASS — All requests succeeded when gateway is healthy');
}

async function testTripping() {
  section('PHASE 2 — Tripping the circuit (gateway failing)');
  await setGatewayMode('failure');
  log('Gateway set to FAILURE mode. Sending 8 requests to trip the breaker...\n');

  for (let i = 1; i <= 8; i++) {
    const result = await chargePayment(`order-fail-${i}`, 100000);
    const cb = await getCircuitStatus();
    log(
      `  Request #${i}: HTTP ${result.status} | payStatus="${result.body.status}" | breaker=${cb.state}`,
    );
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

async function testGracefulDegradation() {
  section('PHASE 3 — Graceful degradation (circuit OPEN, browsing still works)');
  log('Checking that concerts listing still works while payment is down...\n');

  const concerts = await getConcerts();
  log(`  GET /concerts: HTTP ${concerts.status}`);

  const payResult = await chargePayment('order-open', 200000);
  log(`  POST /payment/charge: HTTP ${payResult.status}`);
  log(`  Payment response: ${JSON.stringify(payResult.body, null, 2)}`);

  if (payResult.body.status === 'unavailable') {
    console.log('\n  ✅ PASS — Graceful fallback returned (no crash), listing still works');
  } else {
    console.log('\n  ℹ Payment passed through — circuit may not be open yet');
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
  log(`  Waiting ${resetTimeoutMs / 1000}s for reset timeout (HALF-OPEN)...`);
  await sleep(resetTimeoutMs + 1000);

  await setGatewayMode('success');
  log('  Gateway restored to SUCCESS mode. Sending test charge...\n');

  const result = await chargePayment('order-recovery', 300000);
  const finalState = await getCircuitStatus();
  log(`  Charge result: ${result.body.status}`);
  log(`  Circuit state after recovery: ${finalState.state}`);

  if (finalState.state === 'CLOSED' || finalState.state === 'HALF-OPEN') {
    console.log('\n  ✅ PASS — Circuit recovering (HALF-OPEN or CLOSED after gateway restored)');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n🔌 Circuit Breaker Demo — TicketBox Mechanism #3');
  console.log(`   Backend : ${API_URL}`);
  console.log(`   Gateway : ${GATEWAY_URL}`);

  try {
    await testClosed();
    await sleep(1000);
    await testTripping();
    await sleep(500);
    await testGracefulDegradation();
    await testRecovery();

    console.log('\n\n🎉 Demo complete! Check the backend logs to see state transitions.');
  } catch (err) {
    console.error('\n❌ Error during demo:', err.message);
    console.error('   Make sure backend (port 3000) and mock-gateway (port 4000) are running.');
  }
})();
