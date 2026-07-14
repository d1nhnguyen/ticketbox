import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { VNPayService } from './vnpay.service';

function createService(values: Record<string, string | boolean>): VNPayService {
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
  return new VNPayService(config);
}

const HASH_SECRET = 'secret';

function sortObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  Object.keys(obj)
    .sort()
    .forEach((key) => {
      sorted[key] = obj[key];
    });
  return sorted;
}

function signParams(secret: string, params: Record<string, unknown>): string {
  const sorted = sortObject(params);
  const signData = Object.keys(sorted)
    .map((key) => {
      const value = encodeURIComponent(String(sorted[key])).replace(
        /%20/g,
        '+',
      );
      return `${key}=${value}`;
    })
    .join('&');
  return crypto
    .createHmac('sha512', secret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');
}

function createEnabledService(): VNPayService {
  return createService({
    VNPAY_ENABLED: 'true',
    VNPAY_URL: 'https://sandbox.example/pay',
    VNPAY_TMN_CODE: 'merchant',
    VNPAY_HASH_SECRET: HASH_SECRET,
    VNPAY_RETURN_URL: 'http://localhost:5173/vnpay-return',
  });
}

function buildSignedReturnQuery(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    vnp_Amount: '500000',
    vnp_TxnRef: 'order-1',
    vnp_TransactionNo: '123456',
    vnp_ResponseCode: '00',
    vnp_TransactionStatus: '00',
    vnp_BankCode: 'NCB',
    vnp_PayDate: '20260714120000',
    vnp_CurrCode: 'VND',
    ...overrides,
  };
  const vnp_SecureHash = signParams(HASH_SECRET, params);
  return { ...params, vnp_SecureHash };
}

describe('VNPayService configuration', () => {
  it('is disabled by default and refuses to build a payment URL', () => {
    const service = createService({});

    expect(service.isEnabled()).toBe(false);
    expect(() =>
      service.createPaymentUrl('order-1', 1000, 'test', '127.0.0.1'),
    ).toThrow(ServiceUnavailableException);
    expect(service.verifyReturnUrl({})).toMatchObject({
      success: false,
      code: '98',
    });
  });

  it('does not enable VNPay with an incomplete credential set', () => {
    const service = createService({ VNPAY_ENABLED: 'true' });

    expect(service.isEnabled()).toBe(false);
  });

  it('enables VNPay only when every required value is present', () => {
    const service = createService({
      VNPAY_ENABLED: 'true',
      VNPAY_URL: 'https://sandbox.example/pay',
      VNPAY_TMN_CODE: 'merchant',
      VNPAY_HASH_SECRET: 'secret',
      VNPAY_RETURN_URL: 'http://localhost:5173/vnpay-return',
    });

    expect(service.isEnabled()).toBe(true);
    expect(
      service.createPaymentUrl('order-1', 1000, 'test', '127.0.0.1'),
    ).toContain('https://sandbox.example/pay?');
  });

  it('creates VNPay timestamps in GMT+7 regardless of the server timezone', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-14T09:08:45.000Z'));
    const service = createEnabledService();

    const paymentUrl = new URL(
      service.createPaymentUrl('order-1', 1000, 'test', '127.0.0.1'),
    );

    expect(paymentUrl.searchParams.get('vnp_CreateDate')).toBe(
      '20260714160845',
    );
    expect(paymentUrl.searchParams.get('vnp_ExpireDate')).toBe(
      '20260714161845',
    );
    jest.useRealTimers();
  });
});

describe('VNPayService.verifyReturnUrl', () => {
  it('fails closed on an empty hash secret even if isEnabled() were somehow true', () => {
    const service = createService({
      VNPAY_ENABLED: 'true',
      VNPAY_URL: 'https://sandbox.example/pay',
      VNPAY_TMN_CODE: 'merchant',
      VNPAY_HASH_SECRET: '',
      VNPAY_RETURN_URL: 'http://localhost:5173/vnpay-return',
    });
    // Simulate a future isEnabled()/hasCompleteConfig() bug that would
    // otherwise let an empty-secret config reach signature verification.
    jest.spyOn(service, 'isEnabled').mockReturnValue(true);

    const result = service.verifyReturnUrl(buildSignedReturnQuery());

    expect(result).toMatchObject({ success: false, code: '98' });
  });

  it('rejects a tampered signature without throwing', () => {
    const service = createEnabledService();
    const query = buildSignedReturnQuery();
    query.vnp_SecureHash = 'a'.repeat(128); // same length, wrong value

    const result = service.verifyReturnUrl(query);

    expect(result).toMatchObject({ success: false, code: '97' });
  });

  it('rejects a secureHash of a different length without throwing', () => {
    const service = createEnabledService();
    const query = buildSignedReturnQuery();
    query.vnp_SecureHash = 'tooshort';

    expect(() => service.verifyReturnUrl(query)).not.toThrow();
    expect(service.verifyReturnUrl(query)).toMatchObject({
      success: false,
      code: '97',
    });
  });

  it('accepts a correctly signed, successful callback', () => {
    const service = createEnabledService();
    const query = buildSignedReturnQuery();

    const result = service.verifyReturnUrl(query);

    expect(result).toMatchObject({
      success: true,
      code: '00',
      data: {
        orderId: 'order-1',
        amountVND: 5000,
        transactionNo: '123456',
      },
    });
  });

  it('rejects a correctly signed callback in a non-VND currency', () => {
    const service = createEnabledService();
    const query = buildSignedReturnQuery({ vnp_CurrCode: 'USD' });

    const result = service.verifyReturnUrl(query);

    expect(result).toMatchObject({ success: false, code: '04' });
  });

  it('accepts a correctly signed callback with no currency because VNPay omits it from Return URL', () => {
    const service = createEnabledService();
    const query = buildSignedReturnQuery();
    delete query.vnp_CurrCode;
    delete query.vnp_SecureHash;
    query.vnp_SecureHash = signParams(HASH_SECRET, query);

    expect(service.verifyReturnUrl(query)).toMatchObject({
      success: true,
      code: '00',
    });
  });
});
