import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type GuestCheckinRecord, type GuestListEntry } from '../db/db';
import { syncPendingRecords } from '../services/syncEngine';
import { Search, UserCheck, CloudUpload, CloudOff } from 'lucide-react';

interface Props {
  concertId: string;
}

export default function VIPTab({ concertId }: Props) {
  const [searchTerm, setSearchTerm] = useState('');

  // Tìm kiếm offline trong IndexedDB (Dexie)
  const guests = useLiveQuery(
    async () => {
      if (!searchTerm) return [];

      const term = searchTerm.toLowerCase();
      // Chỉ tìm trong snapshot của sự kiện đang được vận hành.
      const all = await db.guests.where('concertId').equals(concertId).toArray();
      return all.filter(g =>
        g.fullName.toLowerCase().includes(term) ||
        (g.docId && g.docId.toLowerCase().includes(term))
      );
    },
    [searchTerm, concertId]
  );

  // Trạng thái hàng đợi đồng bộ theo từng khách (pending/synced/failed)
  const queueByGuest = useLiveQuery(async () => {
    const rows = await db.guestCheckinQueue
      .filter((record) => record.concertId === concertId)
      .toArray();
    return new Map(rows.map(r => [r.guestId, r]));
  }, [concertId]);

  const handleCheckIn = async (guest: GuestListEntry) => {
    if (guest.status === 'CHECKED_IN') {
      alert('Khách mời này ĐÃ CHECK-IN!');
      return;
    }

    try {
      // Cập nhật trạng thái hiển thị + đưa vào hàng đợi riêng cho khách mời,
      // trong một transaction. PK = guestId nên bấm lặp chỉ ghi đè cùng một dòng.
      await db.transaction('rw', db.guests, db.guestCheckinQueue, async () => {
        await db.guests.update(guest.id, { status: 'CHECKED_IN' });
        await db.guestCheckinQueue.put({
          guestId: guest.id,
          concertId: guest.concertId,
          queuedAt: new Date().toISOString(),
          syncStatus: 'PENDING',
        });
      });

      // Đang online thì đồng bộ ngay; offline thì chu kỳ sync sẽ xử lý khi có mạng.
      void syncPendingRecords();
    } catch (err) {
      console.error(err);
      alert('Đã xảy ra lỗi khi check-in.');
    }
  };

  const renderSyncBadge = (record: GuestCheckinRecord | undefined) => {
    if (!record) return null;

    if (record.syncStatus === 'PENDING') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#b45309', fontSize: '0.8rem', fontWeight: 600 }}>
          <CloudOff size={14} /> Chờ đồng bộ
        </span>
      );
    }
    if (record.syncStatus === 'SYNCED') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontSize: '0.8rem', fontWeight: 600 }}>
          <CloudUpload size={14} />
          {record.resolution === 'ALREADY_CHECKED_IN' ? 'Đã đồng bộ (check-in nơi khác)' : 'Đã đồng bộ'}
        </span>
      );
    }
    return (
      <span style={{ color: '#dc2626', fontSize: '0.8rem', fontWeight: 600 }}>
        {record.resolution === 'NOT_FOUND' ? 'Lỗi: không tìm thấy khách trên server' : 'Lỗi đồng bộ'}
      </span>
    );
  };

  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', textAlign: 'center' }}>👑 VIP Guest List</h2>

      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <Search style={{ position: 'absolute', left: '15px', top: '15px', color: '#9ca3af' }} size={20} />
        <input
          type="text"
          placeholder="Tìm kiếm theo Tên hoặc Số giấy tờ..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '15px 15px 15px 45px', boxSizing: 'border-box', borderRadius: '8px', border: '1.5px solid #d1d5db', fontSize: '1rem', outline: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {searchTerm && guests?.length === 0 && (
          <p style={{ textAlign: 'center', color: '#6b7280' }}>Không tìm thấy khách mời phù hợp.</p>
        )}

        {guests?.map(guest => (
          <div key={guest.id} style={{
            padding: '20px', background: 'white', borderRadius: '12px',
            border: `2px solid ${guest.status === 'CHECKED_IN' ? '#22c55e' : '#e5e7eb'}`,
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '1.2rem', color: '#111827' }}>{guest.fullName}</h3>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>Khu vực: <strong>{guest.zone}</strong></p>
              {guest.docId && <p style={{ margin: '5px 0 0 0', color: '#9ca3af', fontSize: '0.85rem' }}>ID: {guest.docId}</p>}
              <div style={{ marginTop: '5px' }}>{renderSyncBadge(queueByGuest?.get(guest.id))}</div>
            </div>

            <button
              onClick={() => handleCheckIn(guest)}
              disabled={guest.status === 'CHECKED_IN'}
              style={{
                background: guest.status === 'CHECKED_IN' ? '#dcfce7' : '#2563eb',
                color: guest.status === 'CHECKED_IN' ? '#16a34a' : 'white',
                border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: guest.status === 'CHECKED_IN' ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              {guest.status === 'CHECKED_IN' ? <><UserCheck size={18} /> Đã vào</> : 'Check-in'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
