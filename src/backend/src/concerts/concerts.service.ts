import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ConcertsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.concert.findMany({
      where: { status: { not: 'DRAFT' } },
      select: {
        id: true,
        title: true,
        slug: true,
        venue: true,
        startsAt: true,
        status: true,
      },
      orderBy: {
        startsAt: 'asc',
      },
    });
  }

  findBySlug(slug: string) {
    console.log('Finding slug:', slug);
    return this.prisma.concert.findUnique({
      where: { slug },
      include: {
        ticketTypes: {
          select: {
            id: true,
            name: true,
            price: true,
            totalQty: true,
            remainingQty: true,
            maxPerUser: true,
            saleStartsAt: true,
          },
          orderBy: { price: 'desc' },
        },
      },
    });
  }
}
