import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VNPayService } from './vnpay.service';

function createService(values: Record<string, string | boolean>): VNPayService {
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
  return new VNPayService(config);
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
});
