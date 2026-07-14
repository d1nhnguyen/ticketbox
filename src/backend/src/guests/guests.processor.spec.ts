/* eslint-disable @typescript-eslint/no-explicit-any */
import { Job } from 'bullmq';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GuestsProcessor } from './guests.processor';

describe('GuestsProcessor malformed CSV handling', () => {
  let prisma: any;
  let processor: GuestsProcessor;
  let tempDir: string;

  beforeEach(() => {
    prisma = {
      csvImportBatch: { update: jest.fn().mockResolvedValue({}) },
      guestListEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    processor = new GuestsProcessor(prisma);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticketbox-guests-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects a file missing the required fullName and zone headers', async () => {
    const filePath = path.join(tempDir, 'junk.csv');
    fs.writeFileSync(filePath, 'binary,junk\nnot,a-guest-list\n');
    const job = {
      name: 'guests.import',
      data: { batchId: 'batch-1', concertId: 'concert-1', filePath },
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as Job;

    await expect(processor.process(job)).rejects.toThrow(
      'Invalid CSV headers',
    );
    expect(prisma.csvImportBatch.update).not.toHaveBeenCalled();
  });

  it('marks the batch FAILED and removes its temp file after the final retry', async () => {
    const filePath = path.join(tempDir, 'junk.csv');
    fs.writeFileSync(filePath, 'junk');
    const job = {
      data: { batchId: 'batch-1', filePath },
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as Job;

    await processor.onFailed(job, new Error('Invalid CSV headers'));

    expect(prisma.csvImportBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { status: 'FAILED' },
    });
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
