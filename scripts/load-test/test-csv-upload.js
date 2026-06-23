const fs = require('fs');
const path = require('path');
const http = require('http');

async function runTest() {
  const { PrismaClient } = require('../../src/backend/node_modules/@prisma/client');
  const prisma = new PrismaClient();

  try {
    const org = await prisma.user.findFirst({ where: { role: 'ORGANIZER' } });
    if (!org) throw new Error('No ORGANIZER found');
    const concert = await prisma.concert.findFirst();
    if (!concert) throw new Error('No concert found');

    console.log(`Using Organizer ${org.email} and Concert ${concert.id}`);

    // Since we don't have the password, we can generate a token directly if we use jwt or just hit the login API. 
    // Wait, generating a token requires the JWT secret.
    // It's easier to just use `supertest` or HTTP client against the running backend with a manually signed token, or we can just bypass the HTTP layer and call the service directly.
    // Let's just call the service directly using NestFactory to test.

    const { NestFactory } = require('../../src/backend/node_modules/@nestjs/core');
    const { AppModule } = require('../../src/backend/dist/app.module');
    const { GuestsService } = require('../../src/backend/dist/guests/guests.service');

    console.log('Bootstrapping Nest context for test...');
    const app = await NestFactory.createApplicationContext(AppModule);
    const guestsService = app.get(GuestsService);

    const csvPath = path.join(__dirname, '../../data/sample-csv/guests-valid.csv');
    const buffer = fs.readFileSync(csvPath);

    const file = {
      originalname: 'guests-valid.csv',
      mimetype: 'text/csv',
      buffer: buffer,
    };

    console.log('Calling uploadCsv...');
    const res = await guestsService.uploadCsv(concert.id, file);
    console.log('Upload response:', res);

    console.log('Waiting 3 seconds for BullMQ to process...');
    await new Promise(r => setTimeout(r, 3000));

    const batches = await guestsService.getBatches(concert.id);
    console.log('Batches:', batches.map(b => ({
      id: b.id, status: b.status, total: b.rowsTotal, ok: b.rowsOk, failed: b.rowsFailed
    })));

    const entries = await prisma.guestListEntry.findMany({ where: { concertId: concert.id } });
    console.log(`Found ${entries.length} GuestListEntry rows in DB.`);

    await app.close();
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
