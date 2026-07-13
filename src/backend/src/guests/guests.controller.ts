import { Controller, Post, Get, Param, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { Role } from '@prisma/client';
import { GuestsService } from './guests.service';

@Controller('admin/concerts/:concertId/guests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER)
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsv(
    @Param('concertId') concertId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException('File must be a CSV');
    }

    return this.guestsService.uploadCsv(concertId, file);
  }

  @Get('batches')
  async getBatches(@Param('concertId') concertId: string) {
    return this.guestsService.getBatches(concertId);
  }

  @Get('list')
  async getList(@Param('concertId') concertId: string) {
    return this.guestsService.getList(concertId);
  }
}
