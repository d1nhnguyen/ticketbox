import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { TicketTypesService } from './ticket-types.service';
import { PrismaService } from 'src/prisma/prisma.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  concert: { findUnique: jest.fn() },
  ticketType: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  orderItem: { count: jest.fn() },
  ticket: { count: jest.fn() },
  $transaction: jest.fn(),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeTicketType = (overrides = {}) => ({
  id: 'tt-1',
  concertId: 'concert-1',
  name: 'VIP',
  price: 500000,
  totalQty: 100,
  remainingQty: 80, // 20 already sold/reserved
  maxPerUser: 4,
  saleStartsAt: new Date('2026-07-01T12:00:00Z'),
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TicketTypesService', () => {
  let service: TicketTypesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketTypesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TicketTypesService>(TicketTypesService);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      concertId: 'concert-1',
      name: 'SVIP',
      price: 2000000,
      totalQty: 200,
      maxPerUser: 2,
      saleStartsAt: '2026-07-01T12:00:00Z',
    };

    it('creates ticket type with remainingQty = totalQty', async () => {
      mockPrisma.concert.findUnique.mockResolvedValue({ id: 'concert-1' });
      mockPrisma.ticketType.create.mockResolvedValue(makeTicketType({ remainingQty: 200 }));

      await service.create(dto);

      expect(mockPrisma.ticketType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalQty: 200,
            remainingQty: 200,
          }),
        }),
      );
    });

    it('throws NotFoundException when concertId does not exist', async () => {
      mockPrisma.concert.findUnique.mockResolvedValue(null);
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.ticketType.create).not.toHaveBeenCalled();
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
      mockPrisma.ticketType.update.mockResolvedValue(makeTicketType());
    });

    it('updates simple fields without touching remainingQty', async () => {
      mockPrisma.ticketType.findUnique.mockResolvedValue(makeTicketType());

      await service.update('tt-1', { name: 'SVIP', maxPerUser: 2 });

      expect(mockPrisma.ticketType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'SVIP', maxPerUser: 2 }),
        }),
      );
      // No remainingQty delta when totalQty is unchanged
      expect(mockPrisma.ticketType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ remainingQty: expect.anything() }),
        }),
      );
    });

    it('applies a positive delta to remainingQty when totalQty increases', async () => {
      // totalQty 100 → 150: delta = +50, new remaining = 80 + 50 = 130
      mockPrisma.ticketType.findUnique.mockResolvedValue(makeTicketType());

      await service.update('tt-1', { totalQty: 150 });

      expect(mockPrisma.ticketType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalQty: 150,
            remainingQty: { increment: 50 },
          }),
        }),
      );
    });

    it('applies a negative delta to remainingQty when totalQty decreases safely', async () => {
      // totalQty 100 → 90: delta = -10, remaining 80 → 70 (still >= 0)
      mockPrisma.ticketType.findUnique.mockResolvedValue(makeTicketType());

      await service.update('tt-1', { totalQty: 90 });

      expect(mockPrisma.ticketType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalQty: 90,
            remainingQty: { increment: -10 },
          }),
        }),
      );
    });

    it('throws BadRequestException when totalQty reduction would make remainingQty negative', async () => {
      // totalQty 100 → 10: delta = -90, remaining 80 → -10  ← rejected
      mockPrisma.ticketType.findUnique.mockResolvedValue(makeTicketType());

      await expect(service.update('tt-1', { totalQty: 10 })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.ticketType.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when ticket type does not exist', async () => {
      mockPrisma.ticketType.findUnique.mockResolvedValue(null);
      await expect(service.update('bad', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes ticket type when no orders or tickets reference it', async () => {
      mockPrisma.ticketType.findUnique.mockResolvedValue(makeTicketType());
      mockPrisma.orderItem.count.mockResolvedValue(0);
      mockPrisma.ticket.count.mockResolvedValue(0);
      mockPrisma.ticketType.delete.mockResolvedValue({});

      await expect(service.remove('tt-1')).resolves.toEqual({ deleted: true });
      expect(mockPrisma.ticketType.delete).toHaveBeenCalledWith({ where: { id: 'tt-1' } });
    });

    it('throws ConflictException when order items reference the ticket type', async () => {
      mockPrisma.ticketType.findUnique.mockResolvedValue(makeTicketType());
      mockPrisma.orderItem.count.mockResolvedValue(5);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await expect(service.remove('tt-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.ticketType.delete).not.toHaveBeenCalled();
    });

    it('throws ConflictException when issued tickets reference the ticket type', async () => {
      mockPrisma.ticketType.findUnique.mockResolvedValue(makeTicketType());
      mockPrisma.orderItem.count.mockResolvedValue(0);
      mockPrisma.ticket.count.mockResolvedValue(2);

      await expect(service.remove('tt-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.ticketType.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when ticket type does not exist', async () => {
      mockPrisma.ticketType.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
