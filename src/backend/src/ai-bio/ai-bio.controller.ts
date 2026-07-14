import {
  Controller,
  Post,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { Role } from '@prisma/client';
import { AiBioService } from './ai-bio.service';

/**
 * POST /concerts/:id/bio  (multipart/form-data, field = "pdf")
 * @Roles ORGANIZER
 *
 * Upload press-kit PDF → extract text → Anthropic API → lưu Concert.artistBio
 * Response: { bio: string }
 */
@Controller('concerts/:id/bio')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER)
export class AiBioController {
  constructor(private readonly aiBioService: AiBioService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('pdf', {
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
    }),
  )
  async generateBio(
    @Param('id') concertId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File PDF là bắt buộc (field name: pdf)');
    }

    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      throw new BadRequestException(
        'Chỉ chấp nhận file PDF (mimetype: application/pdf)',
      );
    }

    const bio = await this.aiBioService.generateBio(concertId, file.buffer);
    return { bio };
  }
}
