import * as Joi from 'joi';

/**
 * Joi validation schema for required environment variables.
 *
 * Cách dùng:
 *   ConfigModule.forRoot({ validationSchema: envValidationSchema })
 */
export const envValidationSchema = Joi.object({
  // ---- Database ----
  DATABASE_URL: Joi.string().uri().required().messages({
    'string.uri': 'DATABASE_URL must be a valid URI (e.g. postgresql://...)',
    'any.required': 'DATABASE_URL is required',
  }),

  // ---- Redis ----
  REDIS_URL: Joi.string().uri().required().messages({
    'string.uri': 'REDIS_URL must be a valid URI (e.g. redis://...)',
    'any.required': 'REDIS_URL is required',
  }),

  // ---- Auth ----
  JWT_SECRET: Joi.string().min(15).required().messages({
    'string.min': 'JWT_SECRET must be at least 15 characters long',
    'any.required': 'JWT_SECRET is required',
  }),

  // ---- Optional with defaults (no required()) ----
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().integer().min(1).max(65535).default(3000),

  // Payment gateway
  MOCK_PAYMENT_URL: Joi.string()
    .uri()
    .default('http://localhost:4000'),

  // Circuit Breaker tuning
  CIRCUIT_BREAKER_TIMEOUT_MS: Joi.number().integer().positive().default(5000),
  CIRCUIT_BREAKER_ERROR_THRESHOLD: Joi.number().min(1).max(100).default(50),
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: Joi.number().integer().positive().default(10000),
  CIRCUIT_BREAKER_VOL_THRESHOLD: Joi.number().integer().positive().default(5),

  // Rate limiting — global bucket
  RATE_LIMIT_CAPACITY: Joi.number().integer().positive().default(100),
  RATE_LIMIT_REFILL_RATE: Joi.number().positive().default(10),

  // Rate limiting — payment/purchase endpoints (stricter bucket)
  PAYMENT_RATE_LIMIT_CAPACITY: Joi.number().integer().positive().default(20),
  PAYMENT_RATE_LIMIT_REFILL_RATE: Joi.number().positive().default(2),
});
