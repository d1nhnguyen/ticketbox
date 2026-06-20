#!/usr/bin/env node
/**
 * Per-User Limit Load Test — Cơ cơ #6
 *
 * Mục tiêu: Chứng minh khi một tài khoản gửi 10 request đồng thời
 * mua vé VIP (giới hạn tối đa 4 vé/user), hệ thống bán đúng tối đa
 * 4 vé cho user đó, 6 request còn lại thất bại với lỗi HTTP 400.
 *
 * Chạy: node scripts/load-test/per-user-limit.js
 */

const crypto = require('crypto');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const CONCERT_SLUG = 'anh-trai-say-hi';

async function run() {
  console.log('='.repeat(60));
  console.log('Per-User Limit Load Test — Mechanism #6');
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

  // 2. Fetch concert detail to get VIP ticket type ID
  console.log(`🔍 Fetching concert detail for "${CONCERT_SLUG}"...`);
  const concertRes = await fetch(`${API_URL}/concerts/${CONCERT_SLUG}`);
  if (!concertRes.ok) {
    throw new Error(`Failed to fetch concert: ${concertRes.status}`);
  }
  const concert = await concertRes.json();
  const vip = concert.ticketTypes.find(t => t.name === 'VIP');
  if (!vip) {
    throw new Error('VIP ticket type not found in seed data');
  }
  console.log(`✅ Found VIP ticket type: ID = ${vip.id}, maxPerUser = ${vip.maxPerUser}`);

  const ticketTypeId = vip.id;
  const maxPerUser = vip.maxPerUser;
  const numRequests = 10;
  console.log(`🚀 Sending ${numRequests} concurrent purchase requests for 1 VIP ticket each...`);

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
  const success = results.filter(r => r.status === 201).length;
  const badRequest = results.filter(r => r.status === 400).length;
  const other = results.filter(r => r.status !== 201 && r.status !== 400).length;

  console.log('\n📊 RESULTS:');
  console.log(`  ✅ 201 Created (Success) : ${success}`);
  console.log(`  ⛔ 400 Bad Request      : ${badRequest}`);
  console.log(`  ❌ Other (e.g. 500)      : ${other}`);

  console.log('\n🧪 VALIDATION:');
  let passed = true;

  if (success === maxPerUser) {
    console.log(`  ✅ PASS — Successfully bought exactly maxPerUser (${maxPerUser}) tickets.`);
  } else {
    console.log(`  ❌ FAIL — Expected exactly ${maxPerUser} successes, but got ${success}.`);
    passed = false;
  }

  if (badRequest === (numRequests - maxPerUser)) {
    console.log(`  ✅ PASS — Blocked exactly ${numRequests - maxPerUser} requests exceeding limit.`);
  } else {
    console.log(`  ❌ FAIL — Expected ${numRequests - maxPerUser} blocked requests, but got ${badRequest}.`);
    passed = false;
  }

  if (passed) {
    console.log('\n🎉 PER-USER LIMIT TEST PASSED!');
  } else {
    console.log('\n❌ PER-USER LIMIT TEST FAILED!');
  }
}

run().catch(err => console.error('Execution failed:', err));
