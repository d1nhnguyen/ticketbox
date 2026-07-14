import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ConcertsService } from './concerts.service';

@Controller('concerts')
export class ConcertsController {
  constructor(private readonly concertsService: ConcertsService) {}

  @Get()
  findAll() {
    return this.concertsService.findAll();
  }

  @Get(':slug')
  async findOne(@Param('slug') slug: string) {
    const concert = await this.concertsService.findBySlug(slug);
    if (!concert) throw new NotFoundException(`Concert "${slug}" not found!`);
    return concert;
  }
}
