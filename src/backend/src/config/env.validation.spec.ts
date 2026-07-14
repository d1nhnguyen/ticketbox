import { envValidationSchema } from './env.validation';

const required = {
  DATABASE_URL: 'postgresql://postgres:password@localhost:5432/ticketbox',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a-secure-test-secret',
};

describe('payment environment validation', () => {
  it('accepts the default mock-only configuration', () => {
    const { error } = envValidationSchema.validate(required);
    expect(error).toBeUndefined();
  });

  it('rejects an enabled VNPay integration with missing credentials', () => {
    const { error } = envValidationSchema.validate({
      ...required,
      VNPAY_ENABLED: 'true',
    });
    expect(error).toBeDefined();
  });

  it('accepts VNPay only with the complete credential set', () => {
    const { error } = envValidationSchema.validate({
      ...required,
      VNPAY_ENABLED: 'true',
      VNPAY_URL: 'https://sandbox.example/pay',
      VNPAY_TMN_CODE: 'merchant',
      VNPAY_HASH_SECRET: 'secret',
      VNPAY_RETURN_URL: 'http://localhost:5173/vnpay-return',
    });
    expect(error).toBeUndefined();
  });
});
