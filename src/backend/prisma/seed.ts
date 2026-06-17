import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

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

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.create({
      data: { email: u.email, passwordHash, role: u.role },
    });
    console.log(`  ✓ ${u.role.padEnd(10)} ${u.email} / ${u.password}`);
  }

  console.log('🎤 Seeding concerts...');
  const concertsPath = path.join(__dirname, '../../../data/seed/concerts.json');
  const concerts = JSON.parse(fs.readFileSync(concertsPath, 'utf-8'));

  for (const c of concerts) {
    await prisma.concert.create({
      data: {
        title: c.title,
        slug: c.slug,
        venue: c.venue,
        startsAt: new Date(c.startsAt),
        status: c.status,
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
    });
    console.log(`  ✓ ${c.title} (${c.ticketTypes.length} ticket types)`);
  }

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
