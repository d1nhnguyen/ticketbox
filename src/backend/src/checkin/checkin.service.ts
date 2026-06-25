import { Injectable } from '@nestjs/common';
import { SyncStatus, TicketStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScanDto, SyncResult } from './dto/sync.dto';

@Injectable()
export class CheckinService {
  constructor(private readonly prisma: PrismaService) {}

  async syncBatch(scannerId: string, scans: ScanDto[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const s of scans) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          // Atomic conditional flip: VALID → USED — the double-scan guard.
          // Only the first caller succeeds; subsequent calls flip 0 rows.
          const flip = await tx.ticket.updateMany({
            where: { id: s.ticketId, status: TicketStatus.VALID },
            data: {
              status: TicketStatus.USED,
              checkedInAt: new Date(s.scannedAt),
              checkedInBy: scannerId,
            },
          });

          // Append-only audit log — record every attempt, accepted or rejected.
          await tx.checkinLog.create({
            data: {
              id: s.clientLogId,
              ticketId: s.ticketId,
              deviceId: s.deviceId,
              scannedAt: new Date(s.scannedAt),
              syncStatus: flip.count === 1 ? SyncStatus.ACCEPTED : SyncStatus.FAILED,
            },
          });

          return flip.count === 1 ? 'ACCEPTED' : 'DUPLICATE';
        });

        results.push({ ticketId: s.ticketId, clientLogId: s.clientLogId, result });
      } catch (e) {
        // Prisma unique-key violation on clientLogId (PK) = re-sent batch → idempotent.
        if (e?.code === 'P2002') {
          results.push({ ticketId: s.ticketId, clientLogId: s.clientLogId, result: 'ALREADY_SYNCED' });
        } else {
          // Unexpected error: push DUPLICATE so a single bad scan doesn't abort the whole batch.
          results.push({ ticketId: s.ticketId, clientLogId: s.clientLogId, result: 'DUPLICATE' });
        }
      }
    }

    return results;
  }
}
