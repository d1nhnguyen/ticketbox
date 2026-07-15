import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { Role } from '@prisma/client';
import { StatsService } from './stats.service';

@Controller('admin/stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER)
export class StatsAdminController {
  constructor(private readonly statsService: StatsService) {}

  @Get('overview')
  getOverview(@Query('days') days?: string) {
    return this.statsService.getOverview(days ? parseInt(days, 10) : 30);
  }
}
