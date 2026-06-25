import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Roles } from 'src/auth/roles.decorator';
import { RolesGuard } from 'src/auth/roles.guard';
import { CheckinService } from './checkin.service';
import { SyncBatchDto } from './dto/sync.dto';

@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  @Post('sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SCANNER)
  async sync(@Req() req: any, @Body() dto: SyncBatchDto) {
    return this.checkinService.syncBatch(req.user.userId, dto.scans);
  }
}
