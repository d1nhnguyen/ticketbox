import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConcertStatus, OrderStatus, TicketStatus } from '@prisma/client';
import { ConcertsService } from './concerts.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CacheService } from 'src/common/cache/cache.service';
import { CONCERT_CANCELLED_EVENT } from './events/concert-cancelled.event';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  concert: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  ticketType: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  order: {
    count: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
    updateMany: jest.fn(),
  },
  orderItem: { count: jest.fn() },
  ticket: { updateMany: jest.fn() },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};

const mockEventEmitter = { emit: jest.fn() };

// getOrSet runs the loader so the existing prisma assertions still hold
const mockCache = {
  getOrSet: jest.fn((_key: string, _ttl: number, loader: () => any) => loader()),
  invalidateConcert: jest.fn(),
  invalidateAllConcerts: jest.fn(),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeConcert = (overrides = {}) => ({
  id: 'concert-1',
  title: 'Test Concert',
  slug: 'test-concert',
  venue: 'Hà Nội',
  startsAt: new Date('2026-08-01T19:00:00Z'),
  status: ConcertStatus.DRAFT,
  artistBio: null,
  bioSourceUrl: null,
  seatMapSvg: null,
  createdAt: new Date(),
  ticketTypes: [],
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ConcertsService', () => {
  let service: ConcertsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConcertsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<ConcertsService>(ConcertsService);
  });

  // ── Public methods ─────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('excludes DRAFT concerts', async () => {
      mockPrisma.concert.findMany.mockResolvedValue([]);
      await service.findAll();
      expect(mockPrisma.concert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: { not: 'DRAFT' } } }),
      );
    });
  });

  describe('findBySlug', () => {
    it('returns concert with nested ticket types', async () => {
      const concert = makeConcert({ slug: 'test-concert' });
      mockPrisma.concert.findUnique.mockResolvedValue(concert);
      const result = await service.findBySlug('test-concert');
      expect(result).toEqual(concert);
      expect(mockPrisma.concert.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: 'test-concert' } }),
      );
    });
  });

  // ── Admin: adminFindById ───────────────────────────────────────────────────

  describe('adminFindById', () => {
    it('returns concert when found', async () => {
      const concert = makeConcert();
      mockPrisma.concert.findUnique.mockResolvedValue(concert);
      await expect(service.adminFindById('concert-1')).resolves.toEqual(concert);
    });

    it('throws NotFoundException when concert does not exist', async () => {
      mockPrisma.concert.findUnique.mockResolvedValue(null);
      await expect(service.adminFindById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Admin: create ──────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      title: 'New Show',
      slug: 'new-show',
      venue: 'SVĐ Mỹ Đình',
      startsAt: '2026-09-01T19:00:00Z',
    };

    it('creates concert with DRAFT status by default', async () => {
      const created = makeConcert({ title: 'New Show', slug: 'new-show' });
      mockPrisma.concert.create.mockResolvedValue(created);
      const result = await service.create(dto);
      expect(result).toEqual(created);
      expect(mockPrisma.concert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ConcertStatus.DRAFT }),
        }),
      );
    });

    it('throws ConflictException on slug duplicate (Prisma P2002)', async () => {
      mockPrisma.concert.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── Admin: update ──────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates only provided fields', async () => {
      const concert = makeConcert();
      mockPrisma.concert.findUnique.mockResolvedValue(concert);
      mockPrisma.concert.update.mockResolvedValue({ ...concert, title: 'Updated' });

      await service.update('concert-1', { title: 'Updated' });

      expect(mockPrisma.concert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'concert-1' },
          data: { title: 'Updated' },
        }),
      );
    });

    it('throws NotFoundException when concert does not exist', async () => {
      mockPrisma.concert.findUnique.mockResolvedValue(null);
      await expect(service.update('bad-id', { title: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException on slug collision', async () => {
      mockPrisma.concert.findUnique.mockResolvedValue(makeConcert());
      mockPrisma.concert.update.mockRejectedValue({ code: 'P2002' });
      await expect(service.update('concert-1', { slug: 'taken' })).rejects.toThrow(ConflictException);
    });
  });

  // ── Admin: remove ──────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes a DRAFT concert with no orders', async () => {
      mockPrisma.concert.findUnique.mockResolvedValue(makeConcert({ status: ConcertStatus.DRAFT }));
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.concert.delete.mockResolvedValue({});

      await expect(service.remove('concert-1')).resolves.toEqual({ deleted: true });
      expect(mockPrisma.concert.delete).toHaveBeenCalledWith({ where: { id: 'concert-1' } });
    });

    it('throws BadRequestException when concert is not DRAFT', async () => {
      mockPrisma.concert.findUnique.mockResolvedValue(
        makeConcert({ status: ConcertStatus.ON_SALE }),
      );
      await expect(service.remove('concert-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.concert.delete).not.toHaveBeenCalled();
    });

    it('throws ConflictException when DRAFT concert has existing orders', async () => {
      mockPrisma.concert.findUnique.mockResolvedValue(makeConcert({ status: ConcertStatus.DRAFT }));
      mockPrisma.order.count.mockResolvedValue(3);
      await expect(service.remove('concert-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.concert.delete).not.toHaveBeenCalled();
    });
  });

  // ── Admin: cancel ──────────────────────────────────────────────────────────

  describe('cancel', () => {
    const onSaleConcert = makeConcert({
      status: ConcertStatus.ON_SALE,
      ticketTypes: [{ id: 'tt-1' }, { id: 'tt-2' }],
    });

    beforeEach(() => {
      // First call in cancel() → load concert; second call → reload after cancel
      mockPrisma.concert.findUnique
        .mockResolvedValueOnce(onSaleConcert)
        .mockResolvedValueOnce({ ...onSaleConcert, status: ConcertStatus.CANCELLED });

      // $transaction executes the callback immediately
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));

      mockPrisma.concert.update.mockResolvedValue({});
      mockPrisma.order.findMany.mockResolvedValue([]); // no PENDING orders by default
      mockPrisma.order.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.ticket.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.order.findMany.mockResolvedValue([]); // PAID orders for event payload
    });

    it('marks concert as CANCELLED', async () => {
      await service.cancel('concert-1');
      expect(mockPrisma.concert.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: ConcertStatus.CANCELLED } }),
      );
    });

    it('voids VALID tickets for the concert ticket types', async () => {
      await service.cancel('concert-1');
      expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            ticketTypeId: { in: ['tt-1', 'tt-2'] },
            status: TicketStatus.VALID,
          },
          data: { status: TicketStatus.CANCELLED },
        }),
      );
    });

    it('releases stock and fails PENDING orders', async () => {
      const pendingOrder = {
        id: 'ord-1',
        status: OrderStatus.PENDING,
        items: [{ ticketTypeId: 'tt-1', quantity: 2 }],
      };
      // First findMany call inside transaction returns PENDING orders
      mockPrisma.order.findMany.mockResolvedValueOnce([pendingOrder]);
      mockPrisma.ticketType.update.mockResolvedValue({});

      await service.cancel('concert-1');

      expect(mockPrisma.ticketType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tt-1' },
          data: { remainingQty: { increment: 2 } },
        }),
      );
      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { concertId: 'concert-1', status: OrderStatus.PENDING },
          data: { status: OrderStatus.FAILED },
        }),
      );
    });

    it('emits concert.cancelled event with buyer userIds', async () => {
      mockPrisma.order.findMany.mockResolvedValueOnce([]); // PENDING (inside tx)
      mockPrisma.order.findMany.mockResolvedValueOnce([{ userId: 'u-1' }, { userId: 'u-2' }]); // PAID

      await service.cancel('concert-1');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        CONCERT_CANCELLED_EVENT,
        expect.objectContaining({ buyerUserIds: ['u-1', 'u-2'] }),
      );
    });

    it('is idempotent — already CANCELLED concert returns without re-emitting', async () => {
      const cancelledConcert = makeConcert({ status: ConcertStatus.CANCELLED });
      mockPrisma.concert.findUnique.mockReset();
      mockPrisma.concert.findUnique.mockResolvedValue(cancelledConcert);

      await service.cancel('concert-1');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  // ── Admin: getStats ────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns total revenue and per-type breakdown', async () => {
      mockPrisma.concert.findUnique.mockResolvedValue(makeConcert());
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: 5000000 },
        _count: { id: 3 },
      });
      mockPrisma.$queryRaw.mockResolvedValue([
        { ticketTypeId: 'tt-1', soldQty: 5, revenue: 2500000 },
      ]);
      mockPrisma.ticketType.findMany.mockResolvedValue([
        { id: 'tt-1', name: 'VIP', price: 500000, totalQty: 100, remainingQty: 95 },
      ]);

      const stats = await service.getStats('concert-1');

      expect(stats.totalRevenue).toBe(5000000);
      expect(stats.totalOrders).toBe(3);
      expect(stats.ticketTypes[0]).toMatchObject({
        id: 'tt-1',
        soldQty: 5,
        revenue: 2500000,
        remainingQty: 95,
      });
    });

    it('returns zero soldQty/revenue for ticket types with no sales', async () => {
      mockPrisma.concert.findUnique.mockResolvedValue(makeConcert());
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalAmount: null },
        _count: { id: 0 },
      });
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.ticketType.findMany.mockResolvedValue([
        { id: 'tt-2', name: 'GA', price: 200000, totalQty: 500, remainingQty: 500 },
      ]);

      const stats = await service.getStats('concert-1');

      expect(stats.totalRevenue).toBe(0);
      expect(stats.ticketTypes[0].soldQty).toBe(0);
      expect(stats.ticketTypes[0].revenue).toBe(0);
    });

    it('throws NotFoundException for unknown concert', async () => {
      mockPrisma.concert.findUnique.mockResolvedValue(null);
      await expect(service.getStats('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
