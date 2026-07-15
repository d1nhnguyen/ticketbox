import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type GuestCheckinRecord, type GuestListEntry } from '../db/db';
import { syncPendingRecords } from '../services/syncEngine';
import { Search, UserCheck, CloudUpload, CloudOff, Crown } from 'lucide-react';

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
        <span className="badge badge-warning">
          <CloudOff size={14} /> Chờ đồng bộ
        </span>
      );
    }
    if (record.syncStatus === 'SYNCED') {
      return (
        <span className="badge badge-success">
          <CloudUpload size={14} />
          {record.resolution === 'ALREADY_CHECKED_IN' ? 'Đã đồng bộ (check-in nơi khác)' : 'Đã đồng bộ'}
        </span>
      );
    }
    return (
      <span className="badge badge-danger">
        {record.resolution === 'NOT_FOUND' ? 'Lỗi: không tìm thấy khách trên server' : 'Lỗi đồng bộ'}
      </span>
    );
  };

  return (
    <div style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, marginBottom: 20, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Crown size={22} color="var(--primary)" /> VIP Guest List
      </h2>

      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search style={{ position: 'absolute', left: 14, top: 14, color: 'var(--text-3)' }} size={20} />
        <input
          type="text"
          placeholder="Tìm kiếm theo Tên hoặc Số giấy tờ..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input"
          style={{ paddingLeft: 44 }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        {searchTerm && guests?.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--text-2)' }}>Không tìm thấy khách mời phù hợp.</p>
        )}

        {guests?.map(guest => (
          <div key={guest.id} className="card" style={{
            padding: 20,
            borderColor: guest.status === 'CHECKED_IN' ? 'var(--success)' : 'var(--border)',
            borderWidth: 2,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <h3 style={{ fontSize: 17, marginBottom: 5 }}>{guest.fullName}</h3>
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14 }}>Khu vực: <strong>{guest.zone}</strong></p>
              {guest.docId && <p style={{ margin: '5px 0 0 0', color: 'var(--text-3)', fontSize: 13 }}>ID: {guest.docId}</p>}
              <div style={{ marginTop: 5 }}>{renderSyncBadge(queueByGuest?.get(guest.id))}</div>
            </div>

            <button
              onClick={() => handleCheckIn(guest)}
              disabled={guest.status === 'CHECKED_IN'}
              className={guest.status === 'CHECKED_IN' ? 'btn' : 'btn btn-primary'}
              style={guest.status === 'CHECKED_IN' ? { background: 'var(--success-bg)', color: 'var(--success)' } : undefined}
            >
              {guest.status === 'CHECKED_IN' ? <><UserCheck size={18} /> Đã vào</> : 'Check-in'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
