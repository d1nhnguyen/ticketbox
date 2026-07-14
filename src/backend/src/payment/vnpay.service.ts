import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as querystring from 'querystring';

@Injectable()
export class VNPayService {
  private vnpayUrl: string;
  private tmnCode: string;
  private hashSecret: string;
  private returnUrl: string;
  private enabled: boolean;

  constructor(private configService: ConfigService) {
    this.vnpayUrl = this.configService.get<string>('VNPAY_URL') || '';
    this.tmnCode = this.configService.get<string>('VNPAY_TMN_CODE') || '';
    this.hashSecret = this.configService.get<string>('VNPAY_HASH_SECRET') || '';
    this.returnUrl = this.configService.get<string>('VNPAY_RETURN_URL') || '';
    const enabled = this.configService.get<string | boolean>(
      'VNPAY_ENABLED',
      false,
    );
    this.enabled = enabled === true || enabled === 'true';
  }

  isEnabled(): boolean {
    return this.enabled && this.hasCompleteConfig();
  }

  /**
   * Create VNPay payment URL
   * @param orderId - Order ID
   * @param amountVND - Amount in VND
   * @param orderInfo - Order description
   * @param ipAddress - Client IP address
   * @param bankCode - Optional bank code
   * @param language - Language (vn or en)
   */
  createPaymentUrl(
    orderId: string,
    amountVND: number,
    orderInfo: string,
    ipAddress: string,
    bankCode?: string,
    language: string = 'vn',
  ): string {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException(
        'VNPay is disabled or incompletely configured. Use the mock payment method.',
      );
    }

    const date = new Date();
    const createDate = this.formatDate(date);
    // expire in 10 minutes (matching PENDING order expiry)
    const expireDate = this.formatDate(
      new Date(date.getTime() + 10 * 60 * 1000),
    );

    let vnpParams: any = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.tmnCode,
      vnp_Amount: amountVND * 100, // VNPay requires amount * 100
      vnp_CurrCode: 'VND',
      vnp_TxnRef: orderId,
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: 'other',
      vnp_Locale: language || 'vn', // Must be 'vn' or 'en'
      vnp_ReturnUrl: this.returnUrl,
      vnp_IpAddr: ipAddress,
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    if (bankCode) {
      vnpParams.vnp_BankCode = bankCode;
    }

    // Sort params and create signature
    vnpParams = this.sortObject(vnpParams);

    // Create signature data - must be in query string format
    // Format: key1=value1&key2=value2 (values must NOT be URL encoded for signature)
    const signData = Object.keys(vnpParams)
      .map((key) => {
        const value = encodeURIComponent(vnpParams[key]).replace(/%20/g, '+');
        return `${key}=${value}`;
      })
      .join('&');

    const hmac = crypto.createHmac('sha512', this.hashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    vnpParams.vnp_SecureHash = signed;

    // Build payment URL
    const paymentUrl =
      this.vnpayUrl + '?' + signData + '&vnp_SecureHash=' + signed;

    return paymentUrl;
  }

  /**
   * Verify return URL from VNPay
   * @param query - Query parameters from VNPay
   */
  verifyReturnUrl(query: any): {
    success: boolean;
    code: string;
    message: string;
    data?: any;
  } {
    if (!this.isEnabled()) {
      return {
        success: false,
        code: '98',
        message: 'VNPay is disabled',
      };
    }

    const vnpParams = { ...query };
    const secureHash = vnpParams.vnp_SecureHash;

    delete vnpParams.vnp_SecureHash;
    delete vnpParams.vnp_SecureHashType;

    const sortedParams = this.sortObject(vnpParams);

    const signData = Object.keys(sortedParams)
      .map((key) => {
        const value = encodeURIComponent(sortedParams[key]).replace(
          /%20/g,
          '+',
        );
        return `${key}=${value}`;
      })
      .join('&');

    const hmac = crypto.createHmac('sha512', this.hashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    if (secureHash !== signed) {
      return {
        success: false,
        code: '97',
        message: 'Invalid signature',
      };
    }

    const responseCode = vnpParams.vnp_ResponseCode;
    const transactionStatus = vnpParams.vnp_TransactionStatus;
    const amountVND = parseInt(vnpParams.vnp_Amount, 10) / 100;

    if (responseCode === '00' && transactionStatus === '00') {
      return {
        success: true,
        code: '00',
        message: 'Payment successful',
        data: {
          orderId: vnpParams.vnp_TxnRef,
          amountVND: amountVND,
          transactionNo: vnpParams.vnp_TransactionNo,
          bankCode: vnpParams.vnp_BankCode,
          payDate: vnpParams.vnp_PayDate,
          responseCode: responseCode,
        },
      };
    } else {
      return {
        success: false,
        code: responseCode,
        message: this.getResponseMessage(responseCode),
        data: {
          orderId: vnpParams.vnp_TxnRef,
        },
      };
    }
  }

  /**
   * Sort object by key
   */
  private sortObject(obj: any): any {
    const sorted: any = {};
    const keys = Object.keys(obj).sort();
    keys.forEach((key) => {
      sorted[key] = obj[key];
    });
    return sorted;
  }

  private hasCompleteConfig(): boolean {
    return Boolean(
      this.vnpayUrl.trim() &&
      this.tmnCode.trim() &&
      this.hashSecret.trim() &&
      this.returnUrl.trim(),
    );
  }

  /**
   * Format date to YYYYMMDDHHmmss
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  /**
   * Get response message from VNPay response code
   */
  private getResponseMessage(code: string): string {
    const messages: { [key: string]: string } = {
      '00': 'Transaction successful',
      '07': 'Suspicious transaction',
      '09': 'Customer has not registered for Internet Banking',
      '10': 'Incorrect authentication',
      '11': 'Payment deadline expired',
      '12': 'Account locked',
      '24': 'Customer canceled transaction',
      '51': 'Not enough balance',
      '65': 'Transaction limit exceeded',
      '75': 'Bank under maintenance',
      '99': 'Unknown error',
    };
    return messages[code] || 'Unknown error';
  }
}
