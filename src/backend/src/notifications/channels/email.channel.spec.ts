import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailChannel } from './email.channel';

const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

jest.mock('qrcode', () => ({
  toBuffer: jest.fn(async (value: string) => Buffer.from(`png:${value}`)),
}));

describe('EmailChannel', () => {
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        MAIL_HOST: 'mailpit',
        MAIL_PORT: '1025',
        MAIL_FROM: 'TicketBox <no-reply@ticketbox.local>',
      };
      return values[key];
    }),
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    order: { findFirst: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: 'mailpit-message-1' });
    prisma.user.findUnique.mockResolvedValue({ email: 'audience@ticketbox.dev' });
    prisma.order.findFirst.mockResolvedValue({
      id: 'order-1',
      userId: 'user-1',
      status: OrderStatus.PAID,
      totalAmount: 2000000,
      concert: {
        title: 'TicketBox Live',
        venue: 'Nhà thi đấu',
        startsAt: new Date('2026-08-15T12:00:00.000Z'),
      },
      tickets: [
        {
          id: 'ticket-1',
          qrCode: 'qr-value-1',
          ticketType: { name: 'VIP', price: 1000000 },
        },
        {
          id: 'ticket-2',
          qrCode: 'qr-value-2',
          ticketType: { name: 'VIP', price: 1000000 },
        },
      ],
    });
  });

  it('sends a paid-order email with concert data and one inline QR per ticket', async () => {
    const channel = new EmailChannel(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );

    await channel.send({
      userId: 'user-1',
      type: 'ORDER_PAID',
      data: { orderId: 'order-1' },
    });

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'order-1',
          userId: 'user-1',
          status: OrderStatus.PAID,
        },
      }),
    );
    expect(QRCode.toBuffer).toHaveBeenCalledTimes(2);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'audience@ticketbox.dev',
        subject: 'E-ticket: TicketBox Live',
        html: expect.stringContaining('audience@ticketbox.dev'),
        attachments: [
          expect.objectContaining({ cid: 'ticket-ticket-1@ticketbox' }),
          expect.objectContaining({ cid: 'ticket-ticket-2@ticketbox' }),
        ],
      }),
    );
    const sentMessage = mockSendMail.mock.calls[0][0];
    expect(sentMessage.html).toContain('cid:ticket-ticket-1@ticketbox');
    expect(sentMessage.html).toContain('VIP');
    expect(sentMessage.html).toContain('Nhà thi đấu');
  });

  it('rethrows SMTP errors so BullMQ can retry the job', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP unavailable'));
    const channel = new EmailChannel(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );

    await expect(
      channel.send({
        userId: 'user-1',
        type: 'ORDER_PAID',
        data: { orderId: 'order-1' },
      }),
    ).rejects.toThrow('SMTP unavailable');
  });
});
