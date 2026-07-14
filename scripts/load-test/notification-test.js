const { PrismaClient } = require('../../src/backend/node_modules/@prisma/client');
const { NestFactory } = require('../../src/backend/node_modules/@nestjs/core');
const { AppModule } = require('../../src/backend/dist/app.module');
const { OrdersService } = require('../../src/backend/dist/orders/orders.service');

async function testNotification() {
  console.log('Testing Notifications...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const ordersService = app.get(OrdersService);
  const prisma = new PrismaClient();
  
  const user = await prisma.user.findFirst({ where: { role: 'AUDIENCE' } });
  const ticketType = await prisma.ticketType.findFirst();

  // Create PENDING order
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      concertId: ticketType.concertId,
      status: 'PENDING',
      totalAmount: 1000,
      idempotencyKey: `notif-test-${Date.now()}`,
      expiresAt: new Date(Date.now() + 600000),
      items: {
        create: [{ ticketTypeId: ticketType.id, quantity: 1, unitPrice: 1000 }]
      }
    }
  });

  console.log('Confirming payment for order', order.id);
  await ordersService.confirmPayment(order.id, user.id);

  console.log('Wait 3 seconds for BullMQ to process notification jobs...');
  await new Promise(r => setTimeout(r, 3000));

  const notifs = await prisma.notification.findMany({ where: { userId: user.id } });
  console.log(`Found ${notifs.length} notifications in DB for user.`);
  if (notifs.length > 0) {
    console.log('Latest notification:', notifs[notifs.length - 1]);
  }

  await app.close();
  await prisma.$disconnect();
}

testNotification();
