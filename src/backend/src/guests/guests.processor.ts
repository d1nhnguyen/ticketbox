import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as fs from 'fs';
import csvParser from 'csv-parser';

@Processor('guests')
export class GuestsProcessor extends WorkerHost {
  private readonly logger = new Logger(GuestsProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    if (job.name === 'guests.import') {
      const { batchId, concertId, filePath } = job.data;
      this.logger.log(`Processing batch ${batchId} for concert ${concertId}`);

      let rowsTotal = 0;
      let rowsOk = 0;
      let rowsFailed = 0;
      const validRows: any[] = [];
      const seenDocIds = new Set<string>();
      const seenNames = new Set<string>();

      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath, { encoding: 'utf-8' })
          .pipe(csvParser())
          .on('data', (row) => {
            rowsTotal++;
            const fullName = row.fullName?.trim();
            const zone = row.zone?.trim();
            const docId = row.docId?.trim() || null;

            if (!fullName || !zone) {
              this.logger.warn(`Batch ${batchId} row ${rowsTotal} missing required fields`);
              rowsFailed++;
              return;
            }

            if (docId) {
              if (seenDocIds.has(docId)) {
                this.logger.warn(`Batch ${batchId} row ${rowsTotal} duplicate docId ${docId} in file`);
                rowsFailed++;
                return;
              }
              seenDocIds.add(docId);
            } else {
              if (seenNames.has(fullName)) {
                this.logger.warn(`Batch ${batchId} row ${rowsTotal} duplicate fullName ${fullName} (no docId) in file`);
                rowsFailed++;
                return;
              }
              seenNames.add(fullName);
            }

            validRows.push({ fullName, zone, docId });
          })
          .on('end', resolve)
          .on('error', reject);
      });

      // Database deduplication
      if (validRows.length > 0) {
        const docIdsToCheck = validRows.map(r => r.docId).filter(Boolean) as string[];
        const nullDocNamesToCheck = validRows.filter(r => !r.docId).map(r => r.fullName);

        // Find existing docIds in this concert
        let existingDocIds = new Set<string>();
        if (docIdsToCheck.length > 0) {
          const existingByDocId = await this.prisma.guestListEntry.findMany({
            where: {
              concertId,
              docId: { in: docIdsToCheck },
            },
            select: { docId: true },
          });
          existingDocIds = new Set(existingByDocId.map(e => e.docId!));
        }

        // Find existing fullNames (where docId is null) in this concert
        let existingNames = new Set<string>();
        if (nullDocNamesToCheck.length > 0) {
          const existingByName = await this.prisma.guestListEntry.findMany({
            where: {
              concertId,
              docId: null,
              fullName: { in: nullDocNamesToCheck },
            },
            select: { fullName: true },
          });
          existingNames = new Set(existingByName.map(e => e.fullName));
        }

        const toInsert = validRows.filter(row => {
          if (row.docId && existingDocIds.has(row.docId)) {
            this.logger.warn(`Batch ${batchId} duplicate docId ${row.docId} in DB`);
            rowsFailed++;
            return false;
          }
          if (!row.docId && existingNames.has(row.fullName)) {
            this.logger.warn(`Batch ${batchId} duplicate fullName ${row.fullName} in DB`);
            rowsFailed++;
            return false;
          }
          return true;
        });

        rowsOk = toInsert.length;

        if (toInsert.length > 0) {
          await this.prisma.guestListEntry.createMany({
            data: toInsert.map(row => ({
              concertId,
              fullName: row.fullName,
              zone: row.zone,
              docId: row.docId,
              sourceBatchId: batchId,
              status: 'INVITED',
            })),
            skipDuplicates: true,
          });
        }
      }

      // Update batch success
      await this.prisma.csvImportBatch.update({
        where: { id: batchId },
        data: {
          rowsTotal,
          rowsOk,
          rowsFailed,
          status: 'SUCCESS',
        },
      });
      this.logger.log(`Batch ${batchId} finished. Total: ${rowsTotal}, Ok: ${rowsOk}, Failed: ${rowsFailed}`);

      // Cleanup
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error) {
    if (job.attemptsMade === job.opts.attempts) {
      const { batchId, filePath } = job.data;
      this.logger.error(`Batch ${batchId} terminal failure: ${error.message}`);
      
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      try {
        await this.prisma.csvImportBatch.update({
          where: { id: batchId },
          data: { status: 'FAILED' },
        });
      } catch (e) {
        this.logger.error(`Could not mark batch ${batchId} as FAILED`, e);
      }
    }
  }
}
