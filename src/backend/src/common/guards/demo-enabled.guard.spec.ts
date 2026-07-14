import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DemoEnabledGuard } from './demo-enabled.guard';

function createGuard(
  values: Record<string, string | boolean>,
): DemoEnabledGuard {
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
  return new DemoEnabledGuard(config);
}

describe('DemoEnabledGuard', () => {
  it('blocks access by default (no ENABLE_DEMO_ENDPOINTS set)', () => {
    const guard = createGuard({});

    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });

  it('blocks access in production even if ENABLE_DEMO_ENDPOINTS=true', () => {
    const guard = createGuard({
      ENABLE_DEMO_ENDPOINTS: 'true',
      NODE_ENV: 'production',
    });

    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });

  it('allows access when enabled and not in production', () => {
    const guard = createGuard({
      ENABLE_DEMO_ENDPOINTS: 'true',
      NODE_ENV: 'development',
    });

    expect(guard.canActivate()).toBe(true);
  });
});
