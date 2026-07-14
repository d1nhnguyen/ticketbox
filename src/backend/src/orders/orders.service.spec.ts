/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { OrdersService } from './orders.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/common/redis/redis.module';
import { PaymentGatewayService } from 'src/payment/payment-gateway.service';
import { VNPayService } from 'src/payment/vnpay.service';
import { CacheService } from 'src/common/cache/cache.service';

const USER_ID = 'user-1';
const ORDER_ID = 'order-1';

describe('OrdersService.confirmPayment', () => {
  let service: OrdersService;
  let prisma: any;
  let payment: { charge: jest.Mock };

  // a stub `tx` whose methods the $transaction callback runs against
  let tx: any;

  const pendingOrder = (overrides: Partial<any> = {}) => ({
    id: ORDER_ID,
    userId: USER_ID,
    status: OrderStatus.PENDING,
    totalAmount: 5000,
    idempotencyKey: 'key-1',
    items: [{ ticketTypeId: 'tt-1', quantity: 2 }],
    tickets: [],
    ...overrides,
  });

  beforeEach(async () => {
    tx = {
      order: {
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      orderItem: {
        findMany: jest.fn(),
      },
      ticket: {
        create: jest.fn(),
      },
      ticketType: {
        update: jest.fn(),
      },
    };

    prisma = {
      order: { findUnique: jest.fn() },
      // run the callback with our tx stub
      $transaction: jest.fn((cb: any) => cb(tx)),
    };

    payment = { charge: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_CLIENT, useValue: {} },
        { provide: PaymentGatewayService, useValue: payment },
        { provide: VNPayService, useValue: {} },
        { provide: CacheService, useValue: { invalidateConcert: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: getQueueToken('orders'), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('charges, flips to PAID and issues one ticket per unit on success', async () => {
    prisma.order.findUnique.mockResolvedValue(pendingOrder());
    payment.charge.mockResolvedValue({
      status: 'success',
      txnId: 't',
      orderId: ORDER_ID,
      amount: 5000,
    });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.orderItem.findMany.mockResolvedValue([
      { ticketTypeId: 'tt-1', quantity: 2 },
    ]);
    const result = {
      id: ORDER_ID,
      status: OrderStatus.PAID,
      tickets: [{}, {}],
    };
    tx.order.findUnique.mockResolvedValue(result);

    await service.confirmPayment(ORDER_ID, USER_ID);

    expect(payment.charge).toHaveBeenCalledTimes(1);
    expect(tx.ticket.create).toHaveBeenCalledTimes(2); // quantity = 2
  });

  it('is idempotent: a duplicate/concurrent confirm flips 0 rows and re-issues nothing', async () => {
    prisma.order.findUnique.mockResolvedValue(pendingOrder());
    payment.charge.mockResolvedValue({
      status: 'success',
      txnId: 't',
      orderId: ORDER_ID,
      amount: 5000,
    });
    tx.order.updateMany.mockResolvedValue({ count: 0 }); // lost the race
    tx.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      status: OrderStatus.PAID,
    });

    await service.confirmPayment(ORDER_ID, USER_ID);

    expect(tx.ticket.create).not.toHaveBeenCalled();
    expect(tx.orderItem.findMany).not.toHaveBeenCalled();
  });

  it('returns an already-PAID order without charging again', async () => {
    const paid = pendingOrder({ status: OrderStatus.PAID, tickets: [{}, {}] });
    prisma.order.findUnique.mockResolvedValue(paid);

    const result = await service.confirmPayment(ORDER_ID, USER_ID);

    expect(result).toBe(paid);
    expect(payment.charge).not.toHaveBeenCalled();
  });

  it('on a failed charge: flips FAILED, returns stock, and throws', async () => {
    prisma.order.findUnique.mockResolvedValue(pendingOrder());
    payment.charge.mockResolvedValue({
      status: 'failed',
      txnId: '',
      orderId: ORDER_ID,
      amount: 5000,
    });
    tx.order.updateMany.mockResolvedValue({ count: 1 }); // release path wins the flip
    tx.orderItem.findMany.mockResolvedValue([
      { ticketTypeId: 'tt-1', quantity: 2 },
    ]);
    tx.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      status: OrderStatus.FAILED,
    });

    await expect(service.confirmPayment(ORDER_ID, USER_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.ticketType.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { remainingQty: { increment: 2 } },
      }),
    );
    expect(tx.ticket.create).not.toHaveBeenCalled();
  });

  it('on an unavailable gateway (breaker OPEN): throws 503 and leaves the order untouched', async () => {
    prisma.order.findUnique.mockResolvedValue(pendingOrder());
    // breaker OPEN → the gateway's fallback throws ServiceUnavailableException
    payment.charge.mockRejectedValue(
      new ServiceUnavailableException(
        'Payment service is currently unavailable.',
      ),
    );

    await expect(service.confirmPayment(ORDER_ID, USER_ID)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects confirming an order the user does not own', async () => {
    prisma.order.findUnique.mockResolvedValue(
      pendingOrder({ userId: 'someone-else' }),
    );

    await expect(service.confirmPayment(ORDER_ID, USER_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(payment.charge).not.toHaveBeenCalled();
  });

  it('throws NotFound for a missing order', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(service.confirmPayment(ORDER_ID, USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('OrdersService.failPayment', () => {
  let service: OrdersService;
  let prisma: any;
  let tx: any;

  const pendingOrder = (overrides: Partial<any> = {}) => ({
    id: ORDER_ID,
    userId: USER_ID,
    status: OrderStatus.PENDING,
    totalAmount: 5000,
    concert: null,
    ...overrides,
  });

  beforeEach(async () => {
    tx = {
      order: {
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      orderItem: {
        findMany: jest.fn(),
      },
      ticketType: {
        update: jest.fn(),
      },
    };

    prisma = {
      order: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_CLIENT, useValue: {} },
        { provide: PaymentGatewayService, useValue: { charge: jest.fn() } },
        { provide: VNPayService, useValue: { verifyReturnUrl: jest.fn() } },
        { provide: CacheService, useValue: { invalidateConcert: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: getQueueToken('orders'), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('rejects failing an order the user does not own', async () => {
    prisma.order.findUnique.mockResolvedValue(
      pendingOrder({ userId: 'someone-else' }),
    );

    await expect(service.failPayment(ORDER_ID, USER_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws NotFound for a missing order', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(service.failPayment(ORDER_ID, USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('releases stock and flips to FAILED for the real owner', async () => {
    prisma.order.findUnique.mockResolvedValue(pendingOrder());
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.orderItem.findMany.mockResolvedValue([
      { ticketTypeId: 'tt-1', quantity: 2 },
    ]);
    tx.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      status: OrderStatus.FAILED,
    });

    await service.failPayment(ORDER_ID, USER_ID);

    expect(tx.ticketType.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { remainingQty: { increment: 2 } },
      }),
    );
  });
});

describe('OrdersService.handleVNPayReturn', () => {
  let service: OrdersService;
  let prisma: any;
  let vnpay: { verifyReturnUrl: jest.Mock };
  let tx: any;

  const pendingOrder = (overrides: Partial<any> = {}) => ({
    id: ORDER_ID,
    userId: USER_ID,
    status: OrderStatus.PENDING,
    totalAmount: 5000,
    ...overrides,
  });

  beforeEach(async () => {
    tx = {
      order: {
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      orderItem: {
        findMany: jest.fn(),
      },
      ticket: {
        create: jest.fn(),
      },
    };

    prisma = {
      order: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };

    vnpay = { verifyReturnUrl: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_CLIENT, useValue: {} },
        { provide: PaymentGatewayService, useValue: { charge: jest.fn() } },
        { provide: VNPayService, useValue: vnpay },
        { provide: CacheService, useValue: { invalidateConcert: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: getQueueToken('orders'), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('never fulfills the order when the callback signature/verification fails', async () => {
    vnpay.verifyReturnUrl.mockReturnValue({
      success: false,
      code: '97',
      message: 'Invalid signature',
    });

    const result = await service.handleVNPayReturn({});

    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it('rejects a callback for a non-existent order without fulfilling anything', async () => {
    vnpay.verifyReturnUrl.mockReturnValue({
      success: true,
      code: '00',
      data: { orderId: ORDER_ID, amountVND: 5000 },
    });
    prisma.order.findUnique.mockResolvedValue(null);

    const result = await service.handleVNPayReturn({});

    expect(result).toEqual({
      success: false,
      code: '01',
      message: 'Order not found',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a callback whose amount does not match the order total', async () => {
    vnpay.verifyReturnUrl.mockReturnValue({
      success: true,
      code: '00',
      data: { orderId: ORDER_ID, amountVND: 999 },
    });
    prisma.order.findUnique.mockResolvedValue(pendingOrder());

    const result = await service.handleVNPayReturn({});

    expect(result).toEqual({
      success: false,
      code: '04',
      message: 'Amount mismatch',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an amount-mismatched replay against an already-PAID order', async () => {
    vnpay.verifyReturnUrl.mockReturnValue({
      success: true,
      code: '00',
      data: { orderId: ORDER_ID, amountVND: 999 },
    });
    prisma.order.findUnique.mockResolvedValue(
      pendingOrder({ status: OrderStatus.PAID }),
    );

    const result = await service.handleVNPayReturn({});

    expect(result).toEqual({
      success: false,
      code: '04',
      message: 'Amount mismatch',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fulfills the order when signature, order id, and amount all match', async () => {
    vnpay.verifyReturnUrl.mockReturnValue({
      success: true,
      code: '00',
      data: { orderId: ORDER_ID, amountVND: 5000 },
    });
    prisma.order.findUnique.mockResolvedValue(pendingOrder());
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.orderItem.findMany.mockResolvedValue([
      { ticketTypeId: 'tt-1', quantity: 1 },
    ]);
    tx.order.findUnique.mockResolvedValue({
      id: ORDER_ID,
      status: OrderStatus.PAID,
    });

    const result = await service.handleVNPayReturn({});

    expect(tx.ticket.create).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });
});

describe('OrdersService cross-user access (read/pay)', () => {
  let service: OrdersService;
  let prisma: any;

  const pendingOrder = (overrides: Partial<any> = {}) => ({
    id: ORDER_ID,
    userId: USER_ID,
    status: OrderStatus.PENDING,
    totalAmount: 5000,
    concert: { title: 'Test Concert' },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      order: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_CLIENT, useValue: {} },
        { provide: PaymentGatewayService, useValue: { charge: jest.fn() } },
        {
          provide: VNPayService,
          useValue: { createPaymentUrl: jest.fn(), verifyReturnUrl: jest.fn() },
        },
        { provide: CacheService, useValue: { invalidateConcert: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: getQueueToken('orders'), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('rejects reading (findOne) an order the user does not own', async () => {
    prisma.order.findUnique.mockResolvedValue(
      pendingOrder({ userId: 'someone-else' }),
    );

    await expect(service.findOne(ORDER_ID, USER_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws NotFound when reading a missing order', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(service.findOne(ORDER_ID, USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects generating a VNPay pay URL for an order the user does not own', async () => {
    prisma.order.findUnique.mockResolvedValue(
      pendingOrder({ userId: 'someone-else' }),
    );

    await expect(
      service.getVNPayUrl(ORDER_ID, USER_ID, '127.0.0.1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFound when requesting a pay URL for a missing order', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(
      service.getVNPayUrl(ORDER_ID, USER_ID, '127.0.0.1'),
    ).rejects.toThrow(NotFoundException);
  });
});
