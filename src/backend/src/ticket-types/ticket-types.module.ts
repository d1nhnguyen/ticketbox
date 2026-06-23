import { Module } from '@nestjs/common';
import { TicketTypesController } from './ticket-types.controller';
import { TicketTypesService } from './ticket-types.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [TicketTypesController],
  providers: [TicketTypesService, PrismaService],
})
export class TicketTypesModule {}
