#!/usr/bin/env node
/**
 * Oversell Load Test — Cơ chế #1
 *
 * Mục tiêu: Chứng minh khi có 100 request đồng thời mua vé SVIP
 * (trong khi chỉ còn 50 vé), hệ thống bán đúng tối đa 50 vé
 * và không có vé âm (remainingQty >= 0).
 *
 * Chạy: node scripts/load-test/oversell.js
 */

const crypto = require('crypto');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const CONCERT_SLUG = 'anh-trai-say-hi';

async function run() {
  console.log('='.repeat(60));
  console.log('Oversell Load Test — Mechanism #1');
  console.log(`Target: ${API_URL}`);
  console.log('='.repeat(60));

  // 1. Log in to get token
  console.log('👤 Logging in...');
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'audience@ticketbox.dev', password: 'password123' })
  });
  if (!loginRes.ok) {
    throw new Error(`Login failed with status ${loginRes.status}`);
  }
  const { access_token } = await loginRes.json();
  const headers = {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  };
  console.log('✅ Logged in successfully.');

  // 2. Fetch concert detail to get SVIP ticket type ID
  console.log(`🔍 Fetching concert detail for "${CONCERT_SLUG}"...`);
  const concertRes = await fetch(`${API_URL}/concerts/${CONCERT_SLUG}`);
  if (!concertRes.ok) {
    throw new Error(`Failed to fetch concert: ${concertRes.status}`);
  }
  const concert = await concertRes.json();
  const svip = concert.ticketTypes.find(t => t.name === 'SVIP');
  if (!svip) {
    throw new Error('SVIP ticket type not found in seed data');
  }
  console.log(`✅ Found SVIP ticket type: ID = ${svip.id}, totalQty = ${svip.totalQty}, remainingQty = ${svip.remainingQty}`);

  if (svip.remainingQty < svip.totalQty) {
    console.log('⚠️ Warning: Stock is already partially sold. Please run "npm run seed" on backend first.');
  }

  const ticketTypeId = svip.id;
  const numRequests = 100;
  console.log(`🚀 Sending ${numRequests} concurrent purchase requests for 1 SVIP ticket each...`);

  // 3. Fire requests concurrently
  const requests = Array.from({ length: numRequests }, (_, i) => {
    const idempotencyKey = crypto.randomUUID();
    return fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: {
        ...headers,
        'idempotency-key': idempotencyKey
      },
      body: JSON.stringify({ ticketTypeId, quantity: 1 })
    }).then(async res => {
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    }).catch(err => {
      return { status: -1, error: err.message };
    });
  });

  const results = await Promise.all(requests);

  // 4. Summarize results
  const statusCounts = {};
  results.forEach(r => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  });

  const success = results.filter(r => r.status === 201).length;
  const soldOut = results.filter(r => r.status === 409).length;
  const errorLimit = results.filter(r => r.status === 400).length;
  const systemErrors = results.filter(r => r.status === 500 || r.status === -1).length;

  console.log('\n📊 RESULTS:');
  console.log(`  All status counts: ${JSON.stringify(statusCounts)}`);
  console.log(`  ✅ 201 Created (Success) : ${success}`);
  console.log(`  ⛔ 409 Conflict (Sold Out): ${soldOut}`);
  console.log(`  ⚠️  400 Bad Request      : ${errorLimit}`);
  console.log(`  ❌ Errors                : ${systemErrors}`);

  // 5. Verify database state via API
  console.log(`\n🔍 Verifying final remaining quantity...`);
  const verifyRes = await fetch(`${API_URL}/concerts/${CONCERT_SLUG}`);
  const verifyConcert = await verifyRes.json();
  const verifySvip = verifyConcert.ticketTypes.find(t => t.name === 'SVIP');

  console.log(`  Initial stock   : ${svip.remainingQty}`);
  console.log(`  Tickets sold    : ${success}`);
  console.log(`  Remaining stock : ${verifySvip.remainingQty}`);

  console.log('\n🧪 VALIDATION:');
  const expectedRemaining = Math.max(0, svip.remainingQty - success);
  
  let passed = true;
  if (verifySvip.remainingQty === expectedRemaining && verifySvip.remainingQty >= 0) {
    console.log('  ✅ PASS — Remaining quantity matches exactly and is never negative.');
  } else {
    console.log('  ❌ FAIL — Remaining quantity mismatch or negative stock!');
    passed = false;
  }

  if (success <= svip.remainingQty) {
    console.log(`  ✅ PASS — Sold count (${success}) is <= available stock (${svip.remainingQty}).`);
  } else {
    console.log(`  ❌ FAIL — Oversold detected! Sold ${success} but only ${svip.remainingQty} were available.`);
    passed = false;
  }

  if (passed) {
    console.log('\n🎉 OVERSELL PREVENTION TEST PASSED!');
  } else {
    console.log('\n❌ OVERSELL PREVENTION TEST FAILED!');
  }
}

run().catch(err => console.error('Execution failed:', err));
