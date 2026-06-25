import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { GuestsService } from './guests.service';
import { CheckInGuestDto, VerifyGuestDto } from './dto/guest-verify.dto';

/**
 * Scanner-facing guest verification (A4) — backs C's VIP guest-list mode.
 * Separate from the ORGANIZER-only admin CSV controller: these endpoints are
 * SCANNER-only and let the VIP gate verify + check in invited guests.
 */
@Controller('guests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SCANNER)
export class GuestVerificationController {
  constructor(private readonly guestsService: GuestsService) {}

  @Post('verify')
  async verify(@Body() dto: VerifyGuestDto) {
    return this.guestsService.verifyGuest(dto);
  }

  @Post('check-in')
  async checkIn(@Body() dto: CheckInGuestDto) {
    return this.guestsService.checkInGuest(dto.guestId);
  }
}
