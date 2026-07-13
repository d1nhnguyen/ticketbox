import Dexie, { type Table } from 'dexie';

export interface ValidTicket {
  qrCode: string;
  ticketId: string;
  concertId: string;
  ticketTypeId: string;
  maxPerUser: number;
}

export interface ScanRecord {
  clientLogId: string;
  ticketId: string;
  deviceId: string;
  scannedAt: string;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
}

export interface GuestListEntry {
  id: string;
  docId: string | null;
  fullName: string;
  concertId: string;
  zone: string;
  status: 'INVITED' | 'CHECKED_IN';
}

export class ScannerDB extends Dexie {
  validTickets!: Table<ValidTicket>;
  scanQueue!: Table<ScanRecord>;
  guests!: Table<GuestListEntry>;

  constructor() {
    super('ScannerDB');
    this.version(1).stores({
      validTickets: 'qrCode, ticketId',
      scanQueue: 'clientLogId, ticketId, syncStatus',
      guests: 'id, docId, fullName',
    });
  }
}

export const db = new ScannerDB();
