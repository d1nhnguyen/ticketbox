import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';
import { LoginDto } from './login.dto';

describe('RegisterDto', () => {
  it('rejects an invalid email', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: 'not-an-email',
      password: 'password123',
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects a too-short password', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: 'user@example.com',
      password: 'short',
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('accepts a valid payload', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: 'user@example.com',
      password: 'password123',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});

describe('LoginDto', () => {
  it('rejects an invalid email', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'not-an-email',
      password: 'anything',
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects a missing password', async () => {
    const dto = plainToInstance(LoginDto, { email: 'user@example.com' });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('accepts a valid payload', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: 'anything',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
