import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { CheckinService } from './checkin.service';

@Controller('concerts/:id')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SCANNER)
export class ScannerDataController {
  constructor(private readonly checkinService: CheckinService) {}

  @Get('tickets/valid')
  getValidTickets(@Param('id') id: string) {
    return this.checkinService.getValidTickets(id);
  }

  @Get('guests')
  getGuests(@Param('id') id: string) {
    return this.checkinService.getGuests(id);
  }
}
