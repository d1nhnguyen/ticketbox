import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { register: jest.fn(), login: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

describe('AuthController — request validation (ValidationPipe)', () => {
  let app: INestApplication<App>;
  let authService: { register: jest.Mock; login: jest.Mock };

  beforeEach(async () => {
    authService = { register: jest.fn(), login: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    app = module.createNestApplication();
    // Mirrors the global pipe registered in main.ts.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects register with an invalid email with 400 and never calls the service', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'password123' })
      .expect(400);

    expect(authService.register).not.toHaveBeenCalled();
  });

  it('rejects register with a too-short password with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'user@example.com', password: 'short' })
      .expect(400);

    expect(authService.register).not.toHaveBeenCalled();
  });

  it('strips an extra role field from register instead of forwarding it', async () => {
    authService.register.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      role: 'AUDIENCE',
    });

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'user@example.com',
        password: 'password123',
        role: 'ORGANIZER',
      })
      .expect(201);

    expect(authService.register).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password123',
    });
  });

  it('rejects login with a missing password with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@example.com' })
      .expect(400);

    expect(authService.login).not.toHaveBeenCalled();
  });

  it('accepts a valid login body', async () => {
    authService.login.mockResolvedValue({ access_token: 'jwt' });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'password123' })
      .expect(201);
  });
});
