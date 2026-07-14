import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { GuestStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { VerifyGuestDto } from './dto/guest-verify.dto';

@Injectable()
export class GuestsService {
  private readonly logger = new Logger(GuestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('guests') private readonly guestsQueue: Queue,
  ) {}

  async uploadCsv(concertId: string, file: Express.Multer.File) {
    const concert = await this.prisma.concert.findUnique({ where: { id: concertId } });
    if (!concert) {
      throw new NotFoundException(`Concert ${concertId} not found`);
    }
    return this.ingestBuffer(concertId, file.originalname, file.buffer);
  }

  /**
   * Shared ingest core reused by both the interactive upload endpoint and the
   * scheduled inbox poller — checksum dedup, batch bookkeeping, and BullMQ
   * enqueue are identical regardless of where the CSV bytes came from.
   */
  async ingestBuffer(concertId: string, filename: string, buffer: Buffer) {
    // 1. SHA-256 Checksum
    const checksum = createHash('sha256').update(buffer).digest('hex');

    // Pre-check to avoid TOCTOU partially
    const existingBatch = await this.prisma.csvImportBatch.findUnique({
      where: { concertId_checksum: { concertId, checksum } },
    });
    if (existingBatch) {
      throw new ConflictException('File already imported');
    }

    // 2. Create CsvImportBatch and save file
    let batch;
    try {
      batch = await this.prisma.csvImportBatch.create({
        data: {
          concertId,
          filename,
          checksum,
          status: 'PROCESSING',
          rowsTotal: 0,
          rowsOk: 0,
          rowsFailed: 0,
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException('File already imported');
      }
      throw e;
    }

    const uploadsDir = path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadsDir, `${batch.id}.csv`);

    try {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      fs.writeFileSync(filePath, buffer);

      // 3. Enqueue BullMQ job
      await this.guestsQueue.add('guests.import', {
        batchId: batch.id,
        concertId,
        filePath,
      }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
    } catch (error) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      try {
        await this.prisma.csvImportBatch.update({
          where: { id: batch.id },
          data: { status: 'FAILED' },
        });
      } catch (updateError) {
        this.logger.error(
          `Could not mark batch ${batch.id} as FAILED after enqueue error`,
          updateError,
        );
      }
      throw error;
    }

    this.logger.log(`Accepted CSV for concert ${concertId}, batch ${batch.id}`);

    return {
      batchId: batch.id,
      status: 'PROCESSING',
    };
  }

  async getBatches(concertId: string) {
    return this.prisma.csvImportBatch.findMany({
      where: { concertId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Look up a guest at the VIP gate. docId is the stronger match (per-person
   * document), so try it first; fall back to an exact fullName match.
   */
  async findGuest(dto: VerifyGuestDto) {
    if (!dto.docId && !dto.fullName) {
      throw new BadRequestException('Provide docId or fullName to verify a guest');
    }
    await this.ensureConcert(dto.concertId);

    if (dto.docId) {
      const byDoc = await this.prisma.guestListEntry.findFirst({
        where: { concertId: dto.concertId, docId: dto.docId },
      });
      if (byDoc) return byDoc;
    }

    if (dto.fullName) {
      return this.prisma.guestListEntry.findFirst({
        where: { concertId: dto.concertId, fullName: dto.fullName },
      });
    }

    return null;
  }

  async verifyGuest(dto: VerifyGuestDto) {
    const guest = await this.findGuest(dto);
    if (!guest) return { found: false };
    return {
      found: true,
      guest: {
        id: guest.id,
        fullName: guest.fullName,
        zone: guest.zone,
        status: guest.status,
      },
    };
  }

  /**
   * Atomic conditional flip INVITED → CHECKED_IN. Idempotent: a second call
   * (same guest already checked in) flips 0 rows and blocks double entry.
   */
  async checkInGuest(guestId: string) {
    const guest = await this.prisma.guestListEntry.findUnique({ where: { id: guestId } });
    if (!guest) {
      throw new NotFoundException(`Guest ${guestId} not found`);
    }

    const flip = await this.prisma.guestListEntry.updateMany({
      where: { id: guestId, status: GuestStatus.INVITED },
      data: { status: GuestStatus.CHECKED_IN },
    });

    return { ok: flip.count === 1, alreadyCheckedIn: flip.count === 0 };
  }

  private async ensureConcert(concertId: string) {
    const concert = await this.prisma.concert.findUnique({ where: { id: concertId } });
    if (!concert) {
      throw new NotFoundException(`Concert ${concertId} not found`);
    }
  }

  async getList(concertId: string) {
    return this.prisma.guestListEntry.findMany({
      where: { concertId },
    });
  }
}
