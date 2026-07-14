const { PrismaClient } = require('../../src/backend/node_modules/@prisma/client');
const http = require('http');

const prisma = new PrismaClient();

async function runTest() {
  console.log('============================================================');
  console.log('Reservation-Expiry Worker Test');
  console.log('Target: http://localhost:3000 (plus DB check)');
  console.log('============================================================');

  try {
    // 1. Get a user
    const user = await prisma.user.findFirst({ where: { role: 'AUDIENCE' } });
    if (!user) throw new Error('No AUDIENCE user found. Please run seed.');

    // 2. Get a ticket type
    const ticketType = await prisma.ticketType.findFirst();
    if (!ticketType) throw new Error('No ticket type found. Please run seed.');

    const initialStock = ticketType.remainingQty;
    console.log(`ℹ️ Initial stock for ticket type ${ticketType.name}: ${initialStock}`);

    if (initialStock <= 0) {
      console.log('⚠️ Stock is 0, cannot run test. Please seed or free up stock.');
      return;
    }

    // 3. Create a PENDING order that is already EXPIRED (expiresAt in the past)
    // First, reserve the ticket by decrementing the stock manually so we simulate a real order
    await prisma.ticketType.update({
      where: { id: ticketType.id },
      data: { remainingQty: { decrement: 1 } },
    });

    console.log(`ℹ️ Reserved 1 ticket. Remaining stock is now: ${initialStock - 1}`);

    const pastDate = new Date(Date.now() - 60000); // 1 minute ago
    
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        concertId: ticketType.concertId,
        status: 'PENDING',
        totalAmount: ticketType.price,
        idempotencyKey: `test-expire-${Date.now()}`,
        expiresAt: pastDate, // Already expired
        items: {
          create: [
            {
              ticketTypeId: ticketType.id,
              quantity: 1,
              unitPrice: ticketType.price,
            },
          ],
        },
      },
    });

    console.log(`✅ Created PENDING order ${order.id} with expiresAt = ${pastDate.toISOString()}`);
    console.log(`⏳ Waiting for the worker to sweep it (up to 65 seconds)...`);

    // 4. Poll until the order status changes to EXPIRED
    let expired = false;
    for (let i = 0; i < 13; i++) {
      await new Promise(r => setTimeout(r, 5000)); // wait 5 seconds
      const checkOrder = await prisma.order.findUnique({ where: { id: order.id } });
      if (checkOrder.status === 'EXPIRED') {
        expired = true;
        console.log(`✅ Worker swept the order! Status is now EXPIRED.`);
        break;
      }
      process.stdout.write('.');
    }

    console.log('');

    if (!expired) {
      console.log(`❌ Worker did NOT sweep the order in time.`);
      return;
    }

    // 5. Verify the stock was returned
    const finalTicketType = await prisma.ticketType.findUnique({ where: { id: ticketType.id } });
    console.log(`ℹ️ Final stock for ticket type ${ticketType.name}: ${finalTicketType.remainingQty}`);

    if (finalTicketType.remainingQty === initialStock) {
      console.log(`🎉 TEST PASSED! The reservation was correctly released.`);
    } else {
      console.log(`❌ TEST FAILED! Expected stock to be ${initialStock}, but it is ${finalTicketType.remainingQty}.`);
    }

  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
