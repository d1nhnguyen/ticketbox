import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  // Idempotency guard: skip if already seeded so container restarts don't wipe demo data.
  // Set FORCE_SEED=1 to re-seed from scratch (dev only).
  const alreadySeeded = (await prisma.concert.count()) > 0;
  if (alreadySeeded && process.env.FORCE_SEED !== '1') {
    console.log('✅ Database already seeded — skipping (set FORCE_SEED=1 to re-seed).');
    return;
  }

  console.log('🧹 Wiping tables...');
  await prisma.checkinLog.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.guestListEntry.deleteMany();
  await prisma.csvImportBatch.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.ticketType.deleteMany();
  await prisma.concert.deleteMany();
  await prisma.user.deleteMany();

  console.log('👤 Seeding users...');
  const usersPath = path.join(__dirname, '../../../data/seed/users.json');
  const users = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));

  const userMap: Record<string, string> = {}; // email → id
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const created = await prisma.user.create({
      data: { email: u.email, passwordHash, role: u.role },
    });
    userMap[u.email] = created.id;
    console.log(`  ✓ ${u.role.padEnd(10)} ${u.email} / ${u.password}`);
  }

  console.log('🎤 Seeding concerts...');
  const concertsPath = path.join(__dirname, '../../../data/seed/concerts.json');
  const concerts = JSON.parse(fs.readFileSync(concertsPath, 'utf-8'));

  // Keep track of the first concert + its first two ticket types for demo order
  let demoConcertId = '';
  let demoTicketTypeId = '';   // SVIP for the PAID order
  let demoTicketType2Id = '';  // VIP for the PAID order

  for (let i = 0; i < concerts.length; i++) {
    const c = concerts[i];
    const concert = await prisma.concert.create({
      data: {
        title: c.title,
        slug: c.slug,
        venue: c.venue,
        startsAt: new Date(c.startsAt),
        status: c.status,
        artists: c.artists ?? [],
        seatMapSvg: c.seatMapSvg,
        ticketTypes: {
          create: c.ticketTypes.map((tt: any) => ({
            name: tt.name,
            price: tt.price,
            totalQty: tt.totalQty,
            remainingQty: tt.totalQty,
            maxPerUser: tt.maxPerUser,
            saleStartsAt: new Date(tt.saleStartsAt),
          })),
        },
      },
      include: { ticketTypes: true },
    });
    console.log(`  ✓ ${c.title} (${c.ticketTypes.length} ticket types)`);

    // Use the first concert for demo data
    if (i === 0) {
      demoConcertId = concert.id;
      const svip = concert.ticketTypes.find((tt) => tt.name === 'SVIP');
      const vip = concert.ticketTypes.find((tt) => tt.name === 'VIP');
      demoTicketTypeId = svip?.id ?? concert.ticketTypes[0].id;
      demoTicketType2Id = vip?.id ?? concert.ticketTypes[1]?.id ?? concert.ticketTypes[0].id;
    }
  }

  // ─── Demo PAID order + tickets ───────────────────────────────────────────────
  // Find the audience user to assign the order to
  const audienceUserId =
    Object.entries(userMap).find(([email]) => email.includes('audience') || email.includes('user'))?.[1]
    ?? Object.values(userMap)[0];

  console.log('🎫 Seeding demo PAID order + tickets...');

  // Fetch ticket-type prices
  const svipType = await prisma.ticketType.findUnique({ where: { id: demoTicketTypeId } });
  const vipType = await prisma.ticketType.findUnique({ where: { id: demoTicketType2Id } });
  const svipPrice = svipType?.price ?? 5000000;
  const vipPrice = vipType?.price ?? 3000000;

  // 1 SVIP + 2 VIP
  const totalAmount = svipPrice * 1 + vipPrice * 2;

  const demoOrder = await prisma.order.create({
    data: {
      userId: audienceUserId,
      concertId: demoConcertId,
      status: 'PAID',
      totalAmount,
      idempotencyKey: `demo-paid-order-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
      items: {
        create: [
          { ticketTypeId: demoTicketTypeId, quantity: 1, unitPrice: svipPrice },
          { ticketTypeId: demoTicketType2Id, quantity: 2, unitPrice: vipPrice },
        ],
      },
    },
  });

  // Deduct remainingQty for the demo order
  await prisma.ticketType.update({
    where: { id: demoTicketTypeId },
    data: { remainingQty: { decrement: 1 } },
  });
  await prisma.ticketType.update({
    where: { id: demoTicketType2Id },
    data: { remainingQty: { decrement: 2 } },
  });

  // Create tickets (1 SVIP + 2 VIP) — QR codes for scanner demo
  const demoTickets = [
    { ticketTypeId: demoTicketTypeId, qrCode: `DEMO-SVIP-${randomUUID()}` },
    { ticketTypeId: demoTicketType2Id, qrCode: `DEMO-VIP-1-${randomUUID()}` },
    { ticketTypeId: demoTicketType2Id, qrCode: `DEMO-VIP-2-${randomUUID()}` },
  ];

  for (const t of demoTickets) {
    await prisma.ticket.create({
      data: {
        orderId: demoOrder.id,
        ticketTypeId: t.ticketTypeId,
        qrCode: t.qrCode,
        status: 'VALID',
      },
    });
    console.log(`  ✓ Ticket QR: ${t.qrCode}`);
  }

  // ─── Demo GuestListEntry (VIP gate offline test) ────────────────────────────
  console.log('👥 Seeding demo GuestListEntry...');

  // We need a CsvImportBatch to satisfy the FK in GuestListEntry.sourceBatchId
  const demoBatch = await prisma.csvImportBatch.create({
    data: {
      concertId: demoConcertId,
      filename: 'seed-demo-guests.csv',
      checksum: 'seed-demo-' + randomUUID().replace(/-/g, ''),
      status: 'SUCCESS',
      rowsTotal: 5,
      rowsOk: 5,
      rowsFailed: 0,
    },
  });

  const demoGuests = [
    { fullName: 'Nguyễn Văn An', docId: 'CCCD001234567', zone: 'SVIP' },
    { fullName: 'Trần Thị Bình', docId: 'CCCD002345678', zone: 'VIP' },
    { fullName: 'Lê Minh Châu', docId: 'CCCD003456789', zone: 'VIP' },
    { fullName: 'Phạm Thu Dung', docId: null, zone: 'GA' },   // no docId — lookup by name
    { fullName: 'Hoàng Văn Em', docId: 'CCCD005678901', zone: 'CAT1' },
  ];

  for (const g of demoGuests) {
    await prisma.guestListEntry.create({
      data: {
        concertId: demoConcertId,
        fullName: g.fullName,
        docId: g.docId,
        zone: g.zone,
        sourceBatchId: demoBatch.id,
        status: 'INVITED',
      },
    });
    console.log(`  ✓ Guest: ${g.fullName} (${g.zone})`);
  }

  // ─── Flush Redis cache so stale UUIDs don't linger after re-seed ─────────────
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redis = new Redis(redisUrl);
  let flushedCount = 0;
  for (const pattern of ['cache:concert:*', 'idemp:*']) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
        flushedCount += keys.length;
      }
    } while (cursor !== '0');
  }
  await redis.quit();
  console.log(`🗑️  Redis cache flushed (${flushedCount} key(s) removed).`);

  console.log('✅ Seed completed.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
