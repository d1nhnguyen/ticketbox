import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { UpdateTicketTypeDto } from './dto/update-ticket-type.dto';
import * as cheerio from 'cheerio';

@Injectable()
export class TicketTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTicketTypeDto) {
    // Verify the concert exists
    const concert = await this.prisma.concert.findUnique({
      where: { id: dto.concertId },
    });
    if (!concert) {
      throw new NotFoundException(`Concert ${dto.concertId} not found`);
    }

    if (dto.zoneKey && concert.seatMapSvg) {
      const $ = cheerio.load(concert.seatMapSvg, { xmlMode: true });
      const validZones = new Set<string>();
      $('[data-zone]').each((_, el) => {
        const z = $(el).attr('data-zone');
        if (z) validZones.add(z);
      });
      if (!validZones.has(dto.zoneKey)) {
        throw new BadRequestException(`zoneKey "${dto.zoneKey}" does not exist in the concert's seat map.`);
      }
    }

    return this.prisma.ticketType.create({
      data: {
        concertId: dto.concertId,
        name: dto.name,
        zoneKey: dto.zoneKey,
        price: dto.price,
        totalQty: dto.totalQty,
        remainingQty: dto.totalQty, // remaining starts equal to total
        maxPerUser: dto.maxPerUser,
        saleStartsAt: new Date(dto.saleStartsAt),
      },
    });
  }

  async update(id: string, dto: UpdateTicketTypeDto) {
    const tt = await this.prisma.ticketType.findUnique({ 
      where: { id },
      include: { concert: true }
    });
    if (!tt) throw new NotFoundException(`Ticket type ${id} not found`);

    if (dto.zoneKey && dto.zoneKey !== tt.zoneKey) {
      const [orderItemCount, ticketCount] = await Promise.all([
        this.prisma.orderItem.count({ where: { ticketTypeId: id } }),
        this.prisma.ticket.count({ where: { ticketTypeId: id } }),
      ]);
      if (orderItemCount > 0 || ticketCount > 0) {
        throw new BadRequestException('Cannot change zoneKey after orders/tickets have been created for this ticket type.');
      }
      
      if (tt.concert.seatMapSvg) {
        const $ = cheerio.load(tt.concert.seatMapSvg, { xmlMode: true });
        const validZones = new Set<string>();
        $('[data-zone]').each((_, el) => {
          const z = $(el).attr('data-zone');
          if (z) validZones.add(z);
        });
        if (!validZones.has(dto.zoneKey)) {
          throw new BadRequestException(`zoneKey "${dto.zoneKey}" does not exist in the concert's seat map.`);
        }
      }
    }

    // If totalQty is being changed, apply the delta to remainingQty
    let remainingQtyDelta = 0;
    if (dto.totalQty !== undefined && dto.totalQty !== tt.totalQty) {
      remainingQtyDelta = dto.totalQty - tt.totalQty;
      const newRemaining = tt.remainingQty + remainingQtyDelta;
      if (newRemaining < 0) {
        throw new BadRequestException(
          `Cannot reduce total capacity below already-sold/reserved count. ` +
            `Current remaining: ${tt.remainingQty}, attempted reduction: ${-remainingQtyDelta}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      return tx.ticketType.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.zoneKey !== undefined && { zoneKey: dto.zoneKey }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.totalQty !== undefined && {
            totalQty: dto.totalQty,
            remainingQty: { increment: remainingQtyDelta },
          }),
          ...(dto.maxPerUser !== undefined && { maxPerUser: dto.maxPerUser }),
          ...(dto.saleStartsAt !== undefined && {
            saleStartsAt: new Date(dto.saleStartsAt),
          }),
        },
      });
    });
  }

  async remove(id: string) {
    const tt = await this.prisma.ticketType.findUnique({ where: { id } });
    if (!tt) throw new NotFoundException(`Ticket type ${id} not found`);

    // Block delete if any order items or tickets reference this type
    const [orderItemCount, ticketCount] = await Promise.all([
      this.prisma.orderItem.count({ where: { ticketTypeId: id } }),
      this.prisma.ticket.count({ where: { ticketTypeId: id } }),
    ]);

    if (orderItemCount > 0 || ticketCount > 0) {
      throw new ConflictException(
        'Cannot delete a ticket type that has existing orders or issued tickets.',
      );
    }

    await this.prisma.ticketType.delete({ where: { id } });
    return { deleted: true };
  }
}
