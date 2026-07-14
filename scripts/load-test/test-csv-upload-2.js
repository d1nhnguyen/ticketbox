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

    const { NestFactory } = require('../../src/backend/node_modules/@nestjs/core');
    const { AppModule } = require('../../src/backend/dist/app.module');
    const { GuestsService } = require('../../src/backend/dist/guests/guests.service');

    const app = await NestFactory.createApplicationContext(AppModule);
    const guestsService = app.get(GuestsService);

    const csvPath = path.join(__dirname, '../../data/sample-csv/guests-valid.csv');
    let content = fs.readFileSync(csvPath, 'utf-8');
    content += `\nTest User ${Date.now()},,GA`; // Append to make hash unique
    
    const buffer = Buffer.from(content);

    const file = {
      originalname: `guests-valid-${Date.now()}.csv`,
      mimetype: 'text/csv',
      buffer: buffer,
    };

    console.log('Calling uploadCsv...');
    const res = await guestsService.uploadCsv(concert.id, file);
    console.log('Upload response:', res);

    console.log('Waiting 3 seconds for BullMQ to process...');
    await new Promise(r => setTimeout(r, 3000));

    const batches = await guestsService.getBatches(concert.id);
    const myBatch = batches.find(b => b.id === res.batchId);
    console.log('My Batch Status:', myBatch);

    const entries = await prisma.guestListEntry.findMany({ where: { sourceBatchId: res.batchId } });
    console.log(`Found ${entries.length} GuestListEntry rows for this batch.`);

    await app.close();
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
