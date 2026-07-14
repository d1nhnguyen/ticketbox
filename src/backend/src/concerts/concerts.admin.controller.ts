import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Put,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/roles.decorator';
import { Role } from '@prisma/client';
import { ConcertsService } from './concerts.service';
import { CreateConcertDto } from './dto/create-concert.dto';
import { UpdateConcertDto } from './dto/update-concert.dto';

@Controller('admin/concerts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER)
export class ConcertsAdminController {
  constructor(private readonly concertsService: ConcertsService) {}

  @Get()
  findAll() {
    return this.concertsService.adminFindAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.concertsService.adminFindById(id);
  }

  @Post()
  create(@Body() dto: CreateConcertDto) {
    return this.concertsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateConcertDto) {
    return this.concertsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.concertsService.remove(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string) {
    return this.concertsService.cancel(id);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string) {
    return this.concertsService.getStats(id);
  }

  @Put(':id/seat-map')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 256 * 1024 }, // 256KB
  }))
  uploadSeatMap(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (file.mimetype !== 'image/svg+xml') throw new BadRequestException('Only SVG files are allowed');
    return this.concertsService.uploadSeatMap(id, file.buffer.toString('utf8'));
  }

  @Delete(':id/seat-map')
  @HttpCode(HttpStatus.OK)
  removeSeatMap(@Param('id') id: string) {
    return this.concertsService.removeSeatMap(id);
  }
}
