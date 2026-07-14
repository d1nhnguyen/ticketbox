const { PrismaClient } = require('../../src/backend/node_modules/@prisma/client');

// =====================================================================
// Test script: 24h Reminder Cron
// Kiểm tra:
//   [A] Cron tạo REMINDER_24H notification cho buyer PAID
//   [B] Dedup: gọi lại lần 2 không tạo thêm notification
// =====================================================================

const BASE_URL = 'http://localhost:3000';
const TRIGGER_URL = `${BASE_URL}/debug/reminders/trigger`;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTest() {
  const prisma = new PrismaClient();

  try {
    console.log('\n========================================================');
    console.log('🔔  TEST: 24h Reminder Cron');
    console.log('========================================================\n');

    // ── Bước 1: Tìm user AUDIENCE & concert ON_SALE ──────────────────
    console.log('[1] Tìm user AUDIENCE và concert ON_SALE trong DB...');
    const user = await prisma.user.findFirst({ where: { role: 'AUDIENCE' } });
    if (!user) throw new Error('Không tìm thấy user AUDIENCE nào trong DB!');

    const concert = await prisma.concert.findFirst({
      where: { status: 'ON_SALE' },
    });
    if (!concert) throw new Error('Không tìm thấy concert ON_SALE nào trong DB!');

    console.log(`   -> User   : ${user.email} (${user.id})`);
    console.log(`   -> Concert: ${concert.title} (${concert.id})`);

    // ── Bước 2: Đặt startsAt = now + 24h để rơi đúng cửa sổ cron ─────
    console.log('\n[2] Cập nhật startsAt = now + 24h cho concert...');
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.concert.update({
      where: { id: concert.id },
      data: { startsAt },
    });
    console.log(`   -> startsAt mới: ${startsAt.toISOString()}`);

    // ── Bước 3: Tạo / đảm bảo có 1 Order PAID ────────────────────────
    console.log('\n[3] Tạo Order PAID (nếu chưa có) cho user này...');
    let order = await prisma.order.findFirst({
      where: { userId: user.id, concertId: concert.id, status: 'PAID' },
    });

    if (!order) {
      const ticketType = await prisma.ticketType.findFirst({
        where: { concertId: concert.id },
      });
      if (!ticketType) throw new Error('Concert không có TicketType nào!');

      order = await prisma.order.create({
        data: {
          userId: user.id,
          concertId: concert.id,
          status: 'PAID',
          totalAmount: ticketType.price,
          idempotencyKey: `reminder-test-${Date.now()}`,
          expiresAt: new Date(Date.now() + 600_000),
          items: {
            create: [{ ticketTypeId: ticketType.id, quantity: 1, unitPrice: ticketType.price }],
          },
        },
      });
      console.log(`   -> Đã tạo order mới: ${order.id}`);
    } else {
      console.log(`   -> Đã có order PAID: ${order.id}`);
    }

    // ── Bước 4: Xóa notification cũ của user cho concert này (clean start) ─
    console.log('\n[4] Dọn notification cũ (nếu có) để test sạch...');
    const deleted = await prisma.notification.deleteMany({
      where: {
        userId: user.id,
        type: 'REMINDER_24H',
        payload: { path: ['concertId'], equals: concert.id },
      },
    });
    console.log(`   -> Đã xóa ${deleted.count} notification cũ`);

    // ── Bước 5: Trigger cron lần 1 ───────────────────────────────────
    console.log('\n[5] Trigger cron lần 1 → POST /debug/reminders/trigger...');
    const res1 = await fetch(TRIGGER_URL, { method: 'POST' });
    if (!res1.ok) throw new Error(`Trigger thất bại: ${await res1.text()}`);
    console.log(`   -> Response: ${JSON.stringify(await res1.json())}`);

    console.log('   -> Chờ 2 giây để BullMQ xử lý job...');
    await sleep(2000);

    const notifs1 = await prisma.notification.findMany({
      where: {
        userId: user.id,
        type: 'REMINDER_24H',
        payload: { path: ['concertId'], equals: concert.id },
      },
    });
    console.log(`\n   ✅ Sau lần 1: ${notifs1.length} notification(s) trong DB`);
    if (notifs1.length > 0) {
      console.log(`      payload: ${JSON.stringify(notifs1[0].payload, null, 2)}`);
    }

    // ── Bước 6: Trigger cron lần 2 — kiểm tra dedup ─────────────────
    console.log('\n[6] Trigger cron lần 2 → kiểm tra dedup (không được tạo thêm)...');
    const res2 = await fetch(TRIGGER_URL, { method: 'POST' });
    if (!res2.ok) throw new Error(`Trigger lần 2 thất bại: ${await res2.text()}`);
    console.log(`   -> Response: ${JSON.stringify(await res2.json())}`);

    console.log('   -> Chờ 2 giây...');
    await sleep(2000);

    const notifs2 = await prisma.notification.findMany({
      where: {
        userId: user.id,
        type: 'REMINDER_24H',
        payload: { path: ['concertId'], equals: concert.id },
      },
    });
    console.log(`\n   ✅ Sau lần 2: ${notifs2.length} notification(s) trong DB`);

    // ── Kết quả ───────────────────────────────────────────────────────
    console.log('\n========================================================');
    const pass1 = notifs1.length === 1;
    const pass2 = notifs2.length === 1;

    if (pass1) {
      console.log('✅ PASS [A]: Cron tạo đúng 1 notification cho buyer PAID');
    } else {
      console.log(`❌ FAIL [A]: Mong đợi 1, nhận được ${notifs1.length}`);
    }

    if (pass2) {
      console.log('✅ PASS [B]: Dedup hoạt động — không tạo thêm lần 2');
    } else {
      console.log(`❌ FAIL [B]: Dedup KHÔNG hoạt động — có ${notifs2.length} notification!`);
    }
    console.log('========================================================\n');

  } catch (err) {
    console.error('\n❌ LỖI:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
