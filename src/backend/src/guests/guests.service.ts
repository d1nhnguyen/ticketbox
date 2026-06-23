import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class GuestsService {
  private readonly logger = new Logger(GuestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('guests') private readonly guestsQueue: Queue,
  ) {}

  async uploadCsv(concertId: string, file: Express.Multer.File) {
    // 1. Verify concert
    const concert = await this.prisma.concert.findUnique({ where: { id: concertId } });
    if (!concert) {
      throw new NotFoundException(`Concert ${concertId} not found`);
    }

    // 2. SHA-256 Checksum
    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    // Pre-check to avoid TOCTOU partially
    const existingBatch = await this.prisma.csvImportBatch.findUnique({ where: { checksum } });
    if (existingBatch) {
      throw new ConflictException('File already imported');
    }

    // 3. Create CsvImportBatch and save file
    let batch;
    try {
      batch = await this.prisma.csvImportBatch.create({
        data: {
          concertId,
          filename: file.originalname,
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
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const filePath = path.join(uploadsDir, `${batch.id}.csv`);
    fs.writeFileSync(filePath, file.buffer);

    // 4. Enqueue BullMQ job
    await this.guestsQueue.add('guests.import', {
      batchId: batch.id,
      concertId,
      filePath,
    }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });

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
}
