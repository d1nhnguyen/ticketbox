import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  UseGuards,
  Req,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PurchaseDto } from './dto/purchase.dto';
import { RateLimitConfig } from 'src/common/decorators/rate-limit.decorator';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @RateLimitConfig({ capacity: 150, refillRate: 10, keyStrategy: 'user' })
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.AUDIENCE)
  async create(
    @Req() req: any,
    @Body() dto: PurchaseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    const userId = req.user.userId;
    return this.ordersService.createOrder(userId, dto, idempotencyKey);
  }

  @Post(':id/confirm')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.AUDIENCE)
  async confirm(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    return this.ordersService.confirmPayment(id, userId);
  }

  @Post(':id/fail')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.AUDIENCE)
  async fail(@Param('id') id: string) {
    return this.ordersService.failPayment(id);
  }

  @Get('vnpay/url/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.AUDIENCE)
  async getVNPayUrl(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1';
    return this.ordersService.getVNPayUrl(id, userId, ipAddress);
  }

  @Get('vnpay/return')
  async vnpayReturn(@Query() query: any) {
    // Note: VNPay return URL might be called directly by the user's browser, 
    // so we handle it without JwtAuthGuard here, or we expect the frontend 
    // to proxy this call. If frontend proxies, it can pass the query.
    return this.ordersService.handleVNPayReturn(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    return this.ordersService.findOne(id, userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Req() req: any) {
    const userId = req.user.userId;
    return this.ordersService.findAllForUser(userId);
  }
}
