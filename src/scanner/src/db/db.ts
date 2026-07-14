import Dexie, { type Table } from 'dexie';

export interface ValidTicket {
  qrCode: string;
  ticketId: string;
  concertId: string;
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

// Hàng đợi check-in khách mời VIP (tách khỏi scanQueue — record không tương thích).
// PK = guestId: check-in lặp lại offline chỉ ghi đè cùng một dòng (idempotent).
export interface GuestCheckinRecord {
  guestId: string;
  concertId: string;
  queuedAt: string;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  resolution?: 'OK' | 'ALREADY_CHECKED_IN' | 'NOT_FOUND';
}

// Key-value metadata (vd: snapshot pre-download) — ghi cùng transaction với dữ liệu nó mô tả.
export interface MetaRecord {
  key: string;
  concertId?: string;
  downloadedAt?: string;
  ticketCount?: number;
  guestCount?: number;
}

export class ScannerDB extends Dexie {
  validTickets!: Table<ValidTicket>;
  scanQueue!: Table<ScanRecord>;
  guests!: Table<GuestListEntry>;
  guestCheckinQueue!: Table<GuestCheckinRecord>;
  meta!: Table<MetaRecord>;

  constructor() {
    super('ScannerDB');
    this.version(1).stores({
      validTickets: 'qrCode, ticketId',
      scanQueue: 'clientLogId, ticketId, syncStatus',
      guests: 'id, docId, fullName',
    });
    this.version(2)
      .stores({
        validTickets: 'qrCode, ticketId, concertId',
        scanQueue: 'clientLogId, ticketId, syncStatus',
        guests: 'id, docId, fullName, concertId',
        guestCheckinQueue: 'guestId, syncStatus',
        meta: 'key',
      })
      .upgrade((tx) =>
        // v1 chỉ chứa dữ liệu mock — xóa sạch khi nâng cấp.
        Promise.all([
          tx.table('validTickets').clear(),
          tx.table('guests').clear(),
          tx.table('scanQueue').clear(),
        ]),
      );
  }
}

export const db = new ScannerDB();
