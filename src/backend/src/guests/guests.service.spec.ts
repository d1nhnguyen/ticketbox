/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException } from '@nestjs/common';
import * as fs from 'fs';
import { GuestsService } from './guests.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

describe('GuestsService.ingestBuffer', () => {
  const concertId = 'concert-1';
  const buffer = Buffer.from('fullName,zone\nAlice,VIP\n');
  let prisma: any;
  let queue: { add: jest.Mock };
  let service: GuestsService;
  let fsMock: jest.Mocked<typeof fs>;

  beforeEach(() => {
    prisma = {
      csvImportBatch: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'batch-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    service = new GuestsService(prisma, queue as any);

    fsMock = fs as jest.Mocked<typeof fs>;
    fsMock.existsSync.mockReset().mockReturnValue(true);
    fsMock.mkdirSync.mockReset();
    fsMock.writeFileSync.mockReset();
    fsMock.unlinkSync.mockReset();
  });

  it('scopes checksum deduplication to the target concert', async () => {
    await service.ingestBuffer(concertId, 'guests.csv', buffer);

    expect(prisma.csvImportBatch.findUnique).toHaveBeenCalledWith({
      where: {
        concertId_checksum: {
          concertId,
          checksum: expect.any(String),
        },
      },
    });
  });

  it('rejects duplicate content for the same concert', async () => {
    prisma.csvImportBatch.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.ingestBuffer(concertId, 'duplicate.csv', buffer),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.csvImportBatch.create).not.toHaveBeenCalled();
  });

  it('marks the batch FAILED and removes the temp file when enqueue fails', async () => {
    queue.add.mockRejectedValue(new Error('Redis unavailable'));

    await expect(
      service.ingestBuffer(concertId, 'guests.csv', buffer),
    ).rejects.toThrow('Redis unavailable');

    expect(prisma.csvImportBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { status: 'FAILED' },
    });
    expect(fsMock.unlinkSync).toHaveBeenCalledTimes(1);
  });
});
