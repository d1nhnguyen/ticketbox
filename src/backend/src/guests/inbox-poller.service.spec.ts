/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import * as fs from 'fs';
import { InboxPollerService } from './inbox-poller.service';
import { GuestsService } from './guests.service';
import { PrismaService } from 'src/prisma/prisma.service';

// Node's `fs` exports are non-configurable in recent versions, so jest.spyOn
// can't patch them in place — replace the whole module instead.
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
  renameSync: jest.fn(),
}));

const INBOX_DIR = '/tmp/test-inbox';
const CONCERT_ID = 'concert-1';
const SLUG = 'anh-trai-say-hi';

describe('InboxPollerService.poll', () => {
  let service: InboxPollerService;
  let prisma: any;
  let guests: { ingestBuffer: jest.Mock };
  let fsMock: jest.Mocked<typeof fs>;

  const freshStat = () => ({ isFile: () => true, mtimeMs: Date.now() - 10000 });

  beforeEach(async () => {
    process.env.CSV_INBOX_DIR = INBOX_DIR;

    prisma = {
      csvImportBatch: { findUnique: jest.fn() },
      concert: { findUnique: jest.fn() },
    };
    prisma.concert.findUnique.mockResolvedValue({ id: CONCERT_ID, slug: SLUG });
    guests = { ingestBuffer: jest.fn() };

    fsMock = fs as jest.Mocked<typeof fs>;
    fsMock.mkdirSync.mockReset().mockImplementation(() => undefined);
    fsMock.readdirSync.mockReset().mockReturnValue([]);
    fsMock.statSync.mockReset().mockImplementation(() => ({}) as any);
    fsMock.readFileSync
      .mockReset()
      .mockReturnValue(Buffer.from('fullName,docId,zone\nA,1,SVIP\n'));
    fsMock.renameSync.mockReset().mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InboxPollerService,
        { provide: PrismaService, useValue: prisma },
        { provide: GuestsService, useValue: guests },
      ],
    }).compile();

    service = module.get<InboxPollerService>(InboxPollerService);
    service.onModuleInit();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.CSV_INBOX_DIR;
  });

  it('ingests a new file for a known concert slug and leaves it in place', async () => {
    fsMock.readdirSync.mockReturnValue([`${SLUG}__valid.csv`] as any);
    fsMock.statSync.mockReturnValue(freshStat() as any);
    prisma.csvImportBatch.findUnique.mockResolvedValue(null);
    prisma.concert.findUnique.mockResolvedValue({ id: CONCERT_ID, slug: SLUG });
    guests.ingestBuffer.mockResolvedValue({
      batchId: 'batch-1',
      status: 'PROCESSING',
    });

    await service.poll();

    expect(prisma.csvImportBatch.findUnique).toHaveBeenCalledWith({
      where: {
        concertId_checksum: {
          concertId: CONCERT_ID,
          checksum: expect.any(String),
        },
      },
    });
    expect(guests.ingestBuffer).toHaveBeenCalledWith(
      CONCERT_ID,
      `${SLUG}__valid.csv`,
      expect.any(Buffer),
    );
    expect(fsMock.renameSync).not.toHaveBeenCalled();
  });

  it('sweeps a file whose batch already SUCCEEDED into processed/', async () => {
    fsMock.readdirSync.mockReturnValue([`${SLUG}__done.csv`] as any);
    fsMock.statSync.mockReturnValue(freshStat() as any);
    prisma.csvImportBatch.findUnique.mockResolvedValue({
      id: 'batch-1',
      status: 'SUCCESS',
    });

    await service.poll();

    expect(fsMock.renameSync).toHaveBeenCalledTimes(1);
    const [, dest] = fsMock.renameSync.mock.calls[0];
    expect(dest as string).toContain('processed');
    expect(guests.ingestBuffer).not.toHaveBeenCalled();
  });

  it('sweeps a file whose batch FAILED into failed/', async () => {
    fsMock.readdirSync.mockReturnValue([`${SLUG}__bad.csv`] as any);
    fsMock.statSync.mockReturnValue(freshStat() as any);
    prisma.csvImportBatch.findUnique.mockResolvedValue({
      id: 'batch-1',
      status: 'FAILED',
    });

    await service.poll();

    expect(fsMock.renameSync).toHaveBeenCalledTimes(1);
    expect(fsMock.renameSync.mock.calls[0][1] as string).toContain('failed');
    expect(guests.ingestBuffer).not.toHaveBeenCalled();
  });

  it('moves a file with an unknown concert slug to failed/', async () => {
    fsMock.readdirSync.mockReturnValue(['no-such-concert__x.csv'] as any);
    fsMock.statSync.mockReturnValue(freshStat() as any);
    prisma.csvImportBatch.findUnique.mockResolvedValue(null);
    prisma.concert.findUnique.mockResolvedValue(null);

    await service.poll();

    expect(fsMock.renameSync).toHaveBeenCalledTimes(1);
    expect(prisma.csvImportBatch.findUnique).not.toHaveBeenCalled();
    expect(guests.ingestBuffer).not.toHaveBeenCalled();
  });

  it('moves a non-CSV file to failed/ without reading or querying it', async () => {
    fsMock.readdirSync.mockReturnValue([`${SLUG}__notes.txt`] as any);
    fsMock.statSync.mockReturnValue(freshStat() as any);

    await service.poll();

    expect(fsMock.readFileSync).not.toHaveBeenCalled();
    expect(prisma.concert.findUnique).not.toHaveBeenCalled();
    expect(fsMock.renameSync.mock.calls[0][1] as string).toContain('failed');
  });

  it('leaves a just-copied file untouched (mtime too recent)', async () => {
    fsMock.readdirSync.mockReturnValue([`${SLUG}__fresh.csv`] as any);
    fsMock.statSync.mockReturnValue({
      isFile: () => true,
      mtimeMs: Date.now(),
    } as any);

    await service.poll();

    expect(prisma.csvImportBatch.findUnique).not.toHaveBeenCalled();
    expect(fsMock.renameSync).not.toHaveBeenCalled();
  });

  it('leaves a file whose batch is still PROCESSING untouched', async () => {
    fsMock.readdirSync.mockReturnValue([`${SLUG}__inflight.csv`] as any);
    fsMock.statSync.mockReturnValue(freshStat() as any);
    prisma.csvImportBatch.findUnique.mockResolvedValue({
      id: 'batch-1',
      status: 'PROCESSING',
    });

    await service.poll();

    expect(fsMock.renameSync).not.toHaveBeenCalled();
    expect(guests.ingestBuffer).not.toHaveBeenCalled();
  });

  it('does not throw and moves the file to failed/ when ingestBuffer rejects unexpectedly', async () => {
    fsMock.readdirSync.mockReturnValue([`${SLUG}__oops.csv`] as any);
    fsMock.statSync.mockReturnValue(freshStat() as any);
    prisma.csvImportBatch.findUnique.mockResolvedValue(null);
    prisma.concert.findUnique.mockResolvedValue({ id: CONCERT_ID, slug: SLUG });
    guests.ingestBuffer.mockRejectedValue(new Error('boom'));

    await expect(service.poll()).resolves.not.toThrow();
    expect(fsMock.renameSync).toHaveBeenCalledTimes(1);
  });

  it('leaves the file alone when ingestBuffer loses a checksum race (ConflictException)', async () => {
    fsMock.readdirSync.mockReturnValue([`${SLUG}__race.csv`] as any);
    fsMock.statSync.mockReturnValue(freshStat() as any);
    prisma.csvImportBatch.findUnique.mockResolvedValue(null);
    prisma.concert.findUnique.mockResolvedValue({ id: CONCERT_ID, slug: SLUG });
    guests.ingestBuffer.mockRejectedValue(
      new ConflictException('File already imported'),
    );

    await service.poll();

    expect(fsMock.renameSync).not.toHaveBeenCalled();
  });

  it('is re-entrancy-guarded: an overlapping poll() call is a no-op while one is in flight', async () => {
    fsMock.readdirSync.mockReturnValue([`${SLUG}__slow.csv`] as any);
    fsMock.statSync.mockReturnValue(freshStat() as any);
    prisma.csvImportBatch.findUnique.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(null), 20)),
    );
    prisma.concert.findUnique.mockResolvedValue({ id: CONCERT_ID, slug: SLUG });
    guests.ingestBuffer.mockResolvedValue({
      batchId: 'b',
      status: 'PROCESSING',
    });

    const first = service.poll();
    const second = service.poll(); // should return immediately, no-op
    await Promise.all([first, second]);

    expect(guests.ingestBuffer).toHaveBeenCalledTimes(1);
  });
});
