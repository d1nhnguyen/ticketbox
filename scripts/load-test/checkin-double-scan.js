/**
 * checkin-double-scan.js — E2E proof script for Mechanism #4b
 *
 * Chứng minh: Offline double-scan guard + Idempotent batch resync
 *
 * Kịch bản:
 *   1. Device A scan ticket X (online) → backend trả về ACCEPTED
 *   2. Device B scan cùng ticket X  → backend trả về DUPLICATE (atomic VALID→USED flip)
 *   3. Device A gửi lại batch cũ    → backend trả về ALREADY_SYNCED (idempotent PK)
 *
 * Yêu cầu:
 *   - Backend đang chạy tại http://localhost:3000
 *   - Đã seed: (từ src/backend) FORCE_SEED=1 npm run seed
 *   - Có tài khoản SCANNER: scanner@ticketbox.dev / password123
 *   - Có ít nhất 1 vé VALID trong DB (chạy sau khi đã mua vé và thanh toán xong)
 *
 * Chạy: node scripts/load-test/checkin-double-scan.js
 *       node scripts/load-test/checkin-double-scan.js --ticketId=<uuid>
 */

const http = require('http');
const https = require('https');
const { randomUUID } = require('crypto');

// ─── Config ────────────────────────────────────────────────────────────────
const BASE_URL         = process.env.API_URL          || 'http://localhost:3000';
const SCANNER_EMAIL    = process.env.SCANNER_EMAIL    || 'scanner@ticketbox.dev';
const SCANNER_PASSWORD = process.env.SCANNER_PASSWORD || 'password123';
const CONCERT_SLUG     = process.env.CONCERT_SLUG     || 'anh-trai-say-hi';

// Lấy ticketId từ CLI nếu có: --ticketId=<uuid>
const cliTicketId = process.argv
  .find(a => a.startsWith('--ticketId='))
  ?.replace('--ticketId=', '');

// ─── HTTP helper ──────────────────────────────────────────────────────────
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const mod = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : undefined;

    const req = mod.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Colour helpers ───────────────────────────────────────────────────────
const GREEN  = (s) => `\x1b[32m${s}\x1b[0m`;
const RED    = (s) => `\x1b[31m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const BOLD   = (s) => `\x1b[1m${s}\x1b[0m`;

function assert(label, condition, got) {
  if (condition) {
    console.log(`  ${GREEN('✅')} ${label}`);
  } else {
    console.log(`  ${RED('❌')} ${label} — got: ${JSON.stringify(got)}`);
    process.exitCode = 1;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────
(async () => {
  console.log(BOLD('\n━━━ Mechanism #4b: Offline Double-Scan E2E Proof ━━━\n'));

  // ── Step 1: Login as SCANNER ──────────────────────────────────────────
  console.log('→ Step 1: Login as SCANNER');
  const loginRes = await request('POST', '/auth/login', {
    email: SCANNER_EMAIL,
    password: SCANNER_PASSWORD,
  });
  assert(
    `Login → 201 with access_token`,
    loginRes.status === 201 && loginRes.body.access_token,
    loginRes,
  );
  if (!loginRes.body.access_token) {
    console.log(RED('\nAborting: cannot obtain scanner token. Ensure scanner@ticketbox.dev exists with role=SCANNER.'));
    process.exit(1);
  }
  const token = loginRes.body.access_token;
  console.log(`  Scanner token acquired ✔\n`);

  // ── Step 2: Resolve ticketId ──────────────────────────────────────────
  let ticketId = cliTicketId;

  if (!ticketId) {
    console.log(`→ Step 2: Fetch a VALID ticket from concert "${CONCERT_SLUG}"`);
    // First, get the concertId
    const concertRes = await request('GET', `/concerts/${CONCERT_SLUG}`, null, token);
    if (concertRes.status !== 200 || !concertRes.body?.id) {
      console.log(RED(`  Cannot fetch concert "${CONCERT_SLUG}". Ensure it exists and is seeded.`));
      process.exit(1);
    }
    const concertId = concertRes.body.id;

    // Fetch valid tickets (SCANNER-only endpoint)
    const ticketsRes = await request('GET', `/concerts/${concertId}/tickets/valid`, null, token);
    assert(
      `GET /concerts/${concertId}/tickets/valid → 200`,
      ticketsRes.status === 200 && Array.isArray(ticketsRes.body),
      ticketsRes,
    );

    if (!ticketsRes.body?.length) {
      console.log(YELLOW('\n  ⚠ No VALID tickets found. Buy and confirm at least one ticket before running this script.'));
      console.log(YELLOW('  Tip: After purchase, confirm via mock-gateway at http://localhost:4000\n'));
      process.exit(0);
    }

    ticketId = ticketsRes.body[0].ticketId;
    console.log(`  Resolved ticketId = ${ticketId}\n`);
  } else {
    console.log(`→ Step 2: Using provided ticketId = ${ticketId}\n`);
  }

  // ── Step 3: Device A scans ticket X → ACCEPTED ───────────────────────
  console.log('→ Step 3: Device A scans ticket X (first scan — should be ACCEPTED)');
  const logIdA = randomUUID();
  const syncA = await request('POST', '/checkin/sync', {
    scans: [{
      clientLogId: logIdA,
      ticketId,
      deviceId: 'DEVICE-A',
      scannedAt: new Date().toISOString(),
    }],
  }, token);

  assert(`POST /checkin/sync → 200 or 201`, [200, 201].includes(syncA.status), syncA);
  const resultA = syncA.body?.[0]?.result;
  assert(
    `Device A result = ACCEPTED (first scan wins)`,
    resultA === 'ACCEPTED',
    resultA,
  );
  console.log('');

  // ── Step 4: Device B scans same ticket X → DUPLICATE ─────────────────
  console.log('→ Step 4: Device B scans same ticket X (double-scan — should be DUPLICATE)');
  const logIdB = randomUUID();
  const syncB = await request('POST', '/checkin/sync', {
    scans: [{
      clientLogId: logIdB,
      ticketId,
      deviceId: 'DEVICE-B',
      scannedAt: new Date().toISOString(),
    }],
  }, token);

  assert(`POST /checkin/sync → 200 or 201`, [200, 201].includes(syncB.status), syncB);
  const resultB = syncB.body?.[0]?.result;
  assert(
    `Device B result = DUPLICATE (ticket already USED — double-scan blocked)`,
    resultB === 'DUPLICATE',
    resultB,
  );
  console.log('');

  // ── Step 5: Device A re-sends same batch → ALREADY_SYNCED (idempotent)
  console.log('→ Step 5: Device A re-sends the same batch (idempotent resync — should be ALREADY_SYNCED)');
  const syncA2 = await request('POST', '/checkin/sync', {
    scans: [{
      clientLogId: logIdA,   // same clientLogId (PK) as Step 3
      ticketId,
      deviceId: 'DEVICE-A',
      scannedAt: new Date().toISOString(),
    }],
  }, token);

  assert(`POST /checkin/sync → 200 or 201`, [200, 201].includes(syncA2.status), syncA2);
  const resultA2 = syncA2.body?.[0]?.result;
  assert(
    `Device A resync result = ALREADY_SYNCED (idempotent — no duplicate log entry)`,
    resultA2 === 'ALREADY_SYNCED',
    resultA2,
  );
  console.log('');

  // ── Summary ──────────────────────────────────────────────────────────
  console.log(BOLD('━━━ Summary ━━━'));
  console.log(`  ticketId           : ${ticketId}`);
  console.log(`  Device A clientLog : ${logIdA}`);
  console.log(`  Device B clientLog : ${logIdB}`);
  console.log(`  Device A (1st sync): ${resultA  === 'ACCEPTED'       ? GREEN(resultA)  : RED(resultA)}`);
  console.log(`  Device B (dbl-scan): ${resultB  === 'DUPLICATE'      ? GREEN(resultB)  : RED(resultB)}`);
  console.log(`  Device A (re-sync) : ${resultA2 === 'ALREADY_SYNCED' ? GREEN(resultA2) : RED(resultA2)}`);

  const allPassed = resultA === 'ACCEPTED' && resultB === 'DUPLICATE' && resultA2 === 'ALREADY_SYNCED';
  console.log('');
  if (allPassed) {
    console.log(GREEN(BOLD('✅ All assertions passed — Mechanism #4b fully verified!')));
  } else {
    console.log(RED(BOLD('❌ Some assertions failed — see above for details.')));
  }
  console.log('');
})();
