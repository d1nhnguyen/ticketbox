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
  @Roles(Role.AUDIENCE, Role.ORGANIZER)
  async confirm(@Param('id') id: string) {
    return this.ordersService.confirmPayment(id);
  }

  @Post(':id/fail')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.AUDIENCE, Role.ORGANIZER)
  async fail(@Param('id') id: string) {
    return this.ordersService.failPayment(id);
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
