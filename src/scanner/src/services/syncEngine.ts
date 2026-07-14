import axios from 'axios';
import { db } from '../db/db';
import { postCheckinSync, postGuestCheckin, type ScanDto } from './api';

// Cờ chống chồng chu kỳ: một lượt sync đang chạy thì lượt sau bỏ qua.
let syncing = false;

export async function syncPendingRecords(): Promise<void> {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    await flushTicketScans();
    await flushGuestCheckins();
  } finally {
    syncing = false;
  }
}

async function flushTicketScans(): Promise<void> {
  const pending = await db.scanQueue.where('syncStatus').equals('PENDING').toArray();
  if (!pending.length) return;

  // Chỉ gửi đúng các field của ScanDto (bỏ syncStatus).
  const scans: ScanDto[] = pending.map(({ clientLogId, ticketId, deviceId, scannedAt }) => ({
    clientLogId,
    ticketId,
    deviceId,
    scannedAt,
  }));

  let results;
  try {
    results = await postCheckinSync(scans);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 400) {
      // Batch bị backend từ chối (dữ liệu sai định dạng) — retry mãi cũng không qua,
      // đánh FAILED để không chặn các lượt quét sau.
      console.error('[SyncEngine] Batch rejected by server (400), marking FAILED', error.response.data);
      for (const p of pending) {
        await db.scanQueue.update(p.clientLogId, { syncStatus: 'FAILED' });
      }
      return;
    }
    // Lỗi mạng / 5xx / 401 (interceptor đã xử lý phiên) → giữ PENDING, chu kỳ sau thử lại.
    console.warn('[SyncEngine] Ticket sync failed, will retry:', (error as Error).message);
    return;
  }

  for (const r of results) {
    const local = pending.find((p) => p.clientLogId === r.clientLogId);
    if (!local) continue;

    if (r.result === 'ACCEPTED' || r.result === 'ALREADY_SYNCED') {
      await db.scanQueue.update(local.clientLogId, { syncStatus: 'SYNCED' });
    } else if (r.result === 'DUPLICATE') {
      await db.scanQueue.update(local.clientLogId, { syncStatus: 'FAILED' });

      // Giữ nguyên contract event — ScannerTab đang lắng nghe 'sync-conflict'.
      window.dispatchEvent(
        new CustomEvent('sync-conflict', { detail: { ticketId: local.ticketId } }),
      );
    }
  }
}

async function flushGuestCheckins(): Promise<void> {
  const pending = await db.guestCheckinQueue.where('syncStatus').equals('PENDING').toArray();
  if (!pending.length) return;

  for (const record of pending) {
    try {
      const result = await postGuestCheckin(record.guestId);

      if (result.ok) {
        await db.guestCheckinQueue.update(record.guestId, {
          syncStatus: 'SYNCED',
          resolution: 'OK',
        });
      } else if (result.alreadyCheckedIn) {
        // Đã check-in từ thiết bị/kênh khác — idempotent, không phải lỗi.
        await db.guestCheckinQueue.update(record.guestId, {
          syncStatus: 'SYNCED',
          resolution: 'ALREADY_CHECKED_IN',
        });
        await db.guests.update(record.guestId, { status: 'CHECKED_IN' });
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        await db.guestCheckinQueue.update(record.guestId, {
          syncStatus: 'FAILED',
          resolution: 'NOT_FOUND',
        });
        continue;
      }
      // Lỗi mạng/server → dừng, các record còn lại giữ PENDING cho chu kỳ sau.
      console.warn('[SyncEngine] Guest sync failed, will retry:', (error as Error).message);
      break;
    }
  }
}

// Khởi chạy Sync Engine. Trả về hàm cleanup để React StrictMode remount
// không tạo interval/listener trùng lặp.
export function startSyncEngine(): () => void {
  const onOnline = () => {
    void syncPendingRecords();
  };

  window.addEventListener('online', onOnline);
  const interval = setInterval(onOnline, 10_000);
  void syncPendingRecords();

  return () => {
    window.removeEventListener('online', onOnline);
    clearInterval(interval);
  };
}
