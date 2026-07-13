import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationPayload } from './notification-channel.interface';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class EmailChannel implements NotificationChannel {
  private readonly logger = new Logger(EmailChannel.name);
  private transporter: nodemailer.Transporter;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST') || 'smtp.example.com',
      port: this.configService.get<number>('MAIL_PORT') || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: this.configService.get<string>('MAIL_USER') || 'user',
        pass: this.configService.get<string>('MAIL_PASS') || 'pass',
      },
    });
  }

  async send(payload: NotificationPayload): Promise<void> {
    this.logger.log(`[EmailChannel] Sending email to user ${payload.userId}. Type: ${payload.type}`);
    
    // Lookup user email
    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      this.logger.error(`[EmailChannel] User ${payload.userId} not found.`);
      return;
    }

    const toEmail = user.email;
    let subject = 'TicketBox Notification';
    let htmlContent = `<p>Bạn có một thông báo mới từ TicketBox.</p>`;

    if (payload.type === 'ORDER_PAID') {
      subject = 'Xác nhận đặt vé TicketBox thành công!';
      htmlContent = `
        <h2>Cảm ơn bạn đã đặt vé!</h2>
        <p>Mã đơn hàng: <strong>${payload.data?.orderId}</strong></p>
        <p>Bạn có thể vào trang cá nhân trên ứng dụng để xem mã QR soát vé.</p>
      `;
    } else if (payload.type === 'CONCERT_CANCELLED') {
      subject = 'Thông báo hủy sự kiện';
      htmlContent = `
        <h2>Sự kiện đã bị hủy</h2>
        <p>Rất tiếc sự kiện <strong>${payload.data?.concertTitle}</strong> đã bị hủy.</p>
        <p>Chúng tôi sẽ tiến hành hoàn tiền cho bạn trong thời gian sớm nhất.</p>
      `;
    } else if (payload.type === 'REMINDER') {
      subject = 'Nhắc nhở sự kiện sắp diễn ra!';
      htmlContent = `
        <h2>Sự kiện sắp bắt đầu!</h2>
        <p>Sự kiện <strong>${payload.data?.concertTitle}</strong> sẽ diễn ra vào ngày mai. Đừng quên mang theo mã QR để check-in nhé!</p>
      `;
    }

    try {
      const info = await this.transporter.sendMail({
        from: '"TicketBox" <no-reply@ticketbox.dev>',
        to: toEmail,
        subject: subject,
        html: htmlContent,
      });
      this.logger.log(`[EmailChannel] Email sent successfully: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`[EmailChannel] Failed to send email: ${(error as Error).message}`);
    }
  }
}
