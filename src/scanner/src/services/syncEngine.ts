import { db } from '../db/db';
import axios from 'axios';

// Giả lập API backend (nếu backend chưa sẵn sàng)
const MOCK_API = true; 

export async function syncPendingScans() {
  if (!navigator.onLine) return;

  const pending = await db.scanQueue.where({ syncStatus: 'PENDING' }).toArray();
  if (!pending.length) return;

  try {
    let results: any[] = [];
    
    if (MOCK_API) {
      // Mock logic: Giả lập 90% thành công, 10% DUPLICATE
      results = pending.map(p => ({
        clientLogId: p.clientLogId,
        ticketId: p.ticketId,
        result: Math.random() > 0.1 ? 'ACCEPTED' : 'DUPLICATE'
      }));
      // Giả lập delay mạng
      await new Promise(r => setTimeout(r, 1000));
    } else {
      // Logic thật (gọi API server khi Person A code xong)
      const res = await axios.post('http://localhost:3000/checkin/sync', { scans: pending });
      results = res.data;
    }

    for (const r of results) {
      const local = pending.find(p => p.clientLogId === r.clientLogId);
      if (!local) continue;

      if (r.result === 'ACCEPTED' || r.result === 'ALREADY_SYNCED') {
        await db.scanQueue.update(local.clientLogId, { syncStatus: 'SYNCED' });
      } else if (r.result === 'DUPLICATE') {
        await db.scanQueue.update(local.clientLogId, { syncStatus: 'FAILED' });
        
        // Dispatch event để UI có thể hiển thị thông báo Conflict
        window.dispatchEvent(new CustomEvent('sync-conflict', { 
          detail: { ticketId: local.ticketId } 
        }));
      }
    }
  } catch (error) {
    console.error('Lỗi khi đồng bộ:', error);
  }
}

// Khởi chạy Sync Engine
export function startSyncEngine() {
  // Đồng bộ khi có mạng trở lại
  window.addEventListener('online', syncPendingScans);
  
  // Đồng bộ định kỳ mỗi 10 giây khi đang có mạng
  setInterval(syncPendingScans, 10000);
}
