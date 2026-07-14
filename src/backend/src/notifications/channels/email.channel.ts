import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import * as QRCode from 'qrcode';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  NotificationChannel,
  NotificationPayload,
} from './notification-channel.interface';

@Injectable()
export class EmailChannel implements NotificationChannel {
  private readonly logger = new Logger(EmailChannel.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const user = this.configService.get<string>('MAIL_USER');
    const pass = this.configService.get<string>('MAIL_PASS');
    const configuredPort = this.configService.get<string | number>('MAIL_PORT');

    this.from =
      this.configService.get<string>('MAIL_FROM') ??
      'TicketBox <no-reply@ticketbox.local>';
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST') ?? 'localhost',
      port: Number(configuredPort ?? 1025),
      secure: this.configService.get<string>('MAIL_SECURE') === 'true',
      auth: user ? { user, pass: pass ?? '' } : undefined,
    });
  }

  async send(payload: NotificationPayload): Promise<void> {
    this.logger.log(
      `[EmailChannel] Sending ${payload.type} email to user ${payload.userId}`,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true },
    });
    if (!user) {
      throw new Error(`Email recipient user ${payload.userId} not found`);
    }

    try {
      const message =
        payload.type === 'ORDER_PAID'
          ? await this.buildPaidOrderEmail(payload, user.email)
          : this.buildStandardEmail(payload);

      const info = await this.transporter.sendMail({
        from: this.from,
        to: user.email,
        ...message,
      });
      this.logger.log(
        `[EmailChannel] Email sent to ${user.email}: ${info.messageId}`,
      );
    } catch (error) {
      this.logger.error(
        `[EmailChannel] Failed to send ${payload.type} email to ${user.email}: ${(error as Error).message}`,
      );
      // BullMQ only retries failed jobs when the worker receives a rejection.
      throw error;
    }
  }

  private async buildPaidOrderEmail(
    payload: NotificationPayload,
    recipientEmail: string,
  ) {
    const orderId = payload.data?.orderId as string | undefined;
    if (!orderId) {
      throw new Error('ORDER_PAID email is missing orderId');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId: payload.userId,
        status: OrderStatus.PAID,
      },
      include: {
        concert: true,
        tickets: { include: { ticketType: true } },
      },
    });
    if (!order) {
      throw new Error(`Paid order ${orderId} not found for email`);
    }
    if (order.tickets.length === 0) {
      throw new Error(`Paid order ${orderId} has no issued tickets`);
    }

    const attachments = await Promise.all(
      order.tickets.map(async (ticket, index) => {
        const cid = `ticket-${ticket.id}@ticketbox`;
        const content = await QRCode.toBuffer(ticket.qrCode, {
          type: 'png',
          width: 280,
          margin: 2,
          errorCorrectionLevel: 'M',
        });
        return {
          filename: `ticket-${index + 1}.png`,
          content,
          contentType: 'image/png',
          cid,
        };
      }),
    );

    const ticketCards = order.tickets
      .map((ticket, index) => {
        const cid = attachments[index].cid;
        return `
          <div style="border:1px solid #dbeafe;border-radius:12px;padding:18px;margin:16px 0;text-align:center">
            <h3 style="margin:0 0 6px;color:#1e3a8a">Vé ${index + 1} · ${this.escapeHtml(ticket.ticketType.name)}</h3>
            <p style="margin:0 0 12px;color:#475569">${ticket.ticketType.price.toLocaleString('vi-VN')} VNĐ</p>
            <img src="cid:${cid}" width="280" height="280" alt="QR e-ticket ${index + 1}" style="max-width:100%;height:auto" />
            <p style="font-family:monospace;font-size:12px;color:#64748b;word-break:break-all">${this.escapeHtml(ticket.qrCode)}</p>
          </div>`;
      })
      .join('');

    return {
      subject: `E-ticket: ${order.concert.title}`,
      html: `
        <div style="max-width:640px;margin:auto;font-family:Arial,sans-serif;color:#0f172a">
          <h2 style="color:#2563eb">Đặt vé TicketBox thành công!</h2>
          <p>Email người mua: <strong>${this.escapeHtml(recipientEmail)}</strong></p>
          <p>Mã đơn hàng: <strong>${this.escapeHtml(order.id)}</strong></p>
          <div style="background:#f8fafc;border-radius:10px;padding:14px 18px">
            <p><strong>${this.escapeHtml(order.concert.title)}</strong></p>
            <p>Địa điểm: ${this.escapeHtml(order.concert.venue)}</p>
            <p>Thời gian: ${order.concert.startsAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
            <p>Tổng thanh toán: <strong>${order.totalAmount.toLocaleString('vi-VN')} VNĐ</strong></p>
          </div>
          ${ticketCards}
          <p style="color:#b91c1c"><strong>Vui lòng giữ kín QR.</strong> Mỗi vé chỉ được check-in một lần.</p>
        </div>`,
      attachments,
    };
  }

  private buildStandardEmail(payload: NotificationPayload) {
    if (payload.type === 'CONCERT_CANCELLED') {
      return {
        subject: 'Thông báo hủy sự kiện',
        html: `<h2>Sự kiện đã bị hủy</h2><p>Rất tiếc sự kiện <strong>${this.escapeHtml(payload.data?.concertTitle ?? '')}</strong> đã bị hủy.</p>`,
      };
    }

    if (payload.type === 'REMINDER') {
      return {
        subject: 'Nhắc nhở sự kiện sắp diễn ra!',
        html: `<h2>Sự kiện sắp bắt đầu!</h2><p>${this.escapeHtml(payload.data?.concertTitle ?? '')} sẽ diễn ra vào ngày mai.</p>`,
      };
    }

    return {
      subject: 'TicketBox Notification',
      html: '<p>Bạn có một thông báo mới từ TicketBox.</p>',
    };
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
