import {
  Injectable,
  Logger,
  OnModuleInit,
  ConflictException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { GuestsService } from './guests.service';

/**
 * Polls a mounted inbox directory for guest-list CSVs so files can be
 * ingested by "định kỳ nhập" (scheduled drop) rather than only via the
 * interactive upload endpoint. Reuses GuestsService.ingestBuffer for the
 * actual checksum/batch/BullMQ pipeline — this service only decides which
 * file goes where.
 *
 * State machine per tick, per file:
 *   - has a CsvImportBatch already (matched by checksum)?
 *       PROCESSING -> leave in place (still being worked on / retried)
 *       SUCCESS    -> sweep to processed/
 *       FAILED     -> sweep to failed/
 *   - no batch yet -> resolve concert from the "<slug>__name.csv" filename
 *     convention and call ingestBuffer(); leave the file for the next tick
 *     to sweep once the batch resolves.
 */
@Injectable()
export class InboxPollerService implements OnModuleInit {
  private readonly logger = new Logger(InboxPollerService.name);
  private polling = false;

  private readonly inboxDir =
    process.env.CSV_INBOX_DIR ??
    path.resolve(process.cwd(), '../../data/inbox');
  private readonly processedDir = path.join(this.inboxDir, 'processed');
  private readonly failedDir = path.join(this.inboxDir, 'failed');

  constructor(
    private readonly prisma: PrismaService,
    private readonly guestsService: GuestsService,
  ) {}

  onModuleInit() {
    for (const dir of [this.inboxDir, this.processedDir, this.failedDir]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.logger.log(`Watching CSV inbox at ${this.inboxDir}`);
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async poll(): Promise<void> {
    if (this.polling) return; // re-entrancy guard: previous tick still running
    this.polling = true;
    try {
      await this.pollOnce();
    } finally {
      this.polling = false;
    }
  }

  private async pollOnce(): Promise<void> {
    let entries: string[];
    try {
      entries = fs.readdirSync(this.inboxDir);
    } catch (e) {
      this.logger.error(`Cannot read inbox dir ${this.inboxDir}: ${e}`);
      return;
    }

    for (const name of entries) {
      if (name.startsWith('.')) continue; // .gitkeep etc.
      const filePath = path.join(this.inboxDir, name);

      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue; // vanished between readdir and stat
      }
      if (!stat.isFile()) continue;
      if (Date.now() - stat.mtimeMs < 3000) continue; // still being copied

      try {
        await this.handleFile(name, filePath);
      } catch (e) {
        this.logger.error(`Unexpected error handling inbox file ${name}: ${e}`);
        this.moveTo(this.failedDir, filePath, 'unexpected error');
      }
    }
  }

  private async handleFile(name: string, filePath: string): Promise<void> {
    if (!name.toLowerCase().endsWith('.csv')) {
      this.logger.warn(
        `Inbox file "${name}" is not a .csv — moving to failed/`,
      );
      this.moveTo(this.failedDir, filePath, 'not a .csv file');
      return;
    }

    const slug = this.resolveSlug(name);
    const concert = await this.prisma.concert.findUnique({ where: { slug } });
    if (!concert) {
      this.logger.warn(
        `Inbox file "${name}" has unknown concert slug "${slug}" — moving to failed/`,
      );
      this.moveTo(this.failedDir, filePath, `unknown concert slug "${slug}"`);
      return;
    }

    const buffer = fs.readFileSync(filePath);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const existingBatch = await this.prisma.csvImportBatch.findUnique({
      where: { concertId_checksum: { concertId: concert.id, checksum } },
    });

    if (existingBatch) {
      if (existingBatch.status === 'PROCESSING') return; // still in flight, revisit next tick
      if (existingBatch.status === 'SUCCESS') {
        this.logger.log(
          `Inbox file "${name}" already imported (batch ${existingBatch.id}) — sweeping to processed/`,
        );
        this.moveTo(
          this.processedDir,
          filePath,
          'already imported (duplicate content)',
        );
      } else {
        this.logger.warn(
          `Inbox file "${name}" batch ${existingBatch.id} FAILED — sweeping to failed/`,
        );
        this.moveTo(this.failedDir, filePath, 'batch failed');
      }
      return;
    }

    try {
      const result = await this.guestsService.ingestBuffer(
        concert.id,
        name,
        buffer,
      );
      this.logger.log(
        `Inbox file "${name}" accepted for concert ${slug}, batch ${result.batchId}`,
      );
      // Leave the file in place; next tick's checksum lookup sweeps it once the batch resolves.
    } catch (e) {
      if (e instanceof ConflictException) {
        // Lost a race with a concurrent ingest of identical content — next tick will sweep it.
        return;
      }
      this.logger.error(`Inbox file "${name}" failed to enqueue: ${e}`);
      this.moveTo(this.failedDir, filePath, 'enqueue error');
    }
  }

  private resolveSlug(filename: string): string {
    const base = filename.replace(/\.csv$/i, '');
    const sep = base.indexOf('__');
    return sep === -1 ? base : base.slice(0, sep);
  }

  private moveTo(destDir: string, filePath: string, reason: string): void {
    try {
      const dest = path.join(
        destDir,
        `${Date.now()}__${path.basename(filePath)}`,
      );
      fs.renameSync(filePath, dest);
    } catch (e) {
      this.logger.error(`Failed to move "${filePath}" (${reason}): ${e}`);
    }
  }
}
