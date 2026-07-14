const fs = require('fs');
const path = require('path');

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

    // Dùng file guests-with-errors.csv
    const csvPath = path.join(__dirname, '../../data/sample-csv/guests-with-errors.csv');
    let content = fs.readFileSync(csvPath, 'utf-8');
    
    // Thêm dummy row để đổi mã hash (bảo đảm không bị lỗi duplicate file nếu chạy nhiều lần)
    content += `\nTest Error Upload ${Date.now()},,`;
    const buffer = Buffer.from(content);

    const file = {
      originalname: `guests-with-errors-${Date.now()}.csv`,
      mimetype: 'text/csv',
      buffer: buffer,
    };

    console.log(`Bắt đầu test upload file lỗi cho Concert: ${concert.id}...`);
    const res = await guestsService.uploadCsv(concert.id, file);
    console.log('Phản hồi từ API:', res);

    console.log('Đang chờ BullMQ xử lý (3 giây)...');
    await new Promise(r => setTimeout(r, 3000));

    const batches = await guestsService.getBatches(concert.id);
    const myBatch = batches.find(b => b.id === res.batchId);
    console.log('Kết quả Import Batch:', myBatch);

    const entries = await prisma.guestListEntry.findMany({ where: { sourceBatchId: res.batchId } });
    console.log(`Đã lưu thành công ${entries.length} người hợp lệ vào DB.`);

    await app.close();
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
