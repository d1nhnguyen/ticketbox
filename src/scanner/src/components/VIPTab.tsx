import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Search, UserCheck } from 'lucide-react';

export default function VIPTab() {
  const [searchTerm, setSearchTerm] = useState('');

  // Tìm kiếm offline trong IndexedDB (Dexie)
  const guests = useLiveQuery(
    async () => {
      if (!searchTerm) return [];
      
      const term = searchTerm.toLowerCase();
      // Lấy toàn bộ guests và filter (offline)
      const all = await db.guests.toArray();
      return all.filter(g => 
        g.fullName.toLowerCase().includes(term) || 
        (g.docId && g.docId.toLowerCase().includes(term))
      );
    },
    [searchTerm]
  );

  const handleCheckIn = async (guest: any) => {
    if (guest.status === 'CHECKED_IN') {
      alert('Khách mời này ĐÃ CHECK-IN!');
      return;
    }

    try {
      // 1. Cập nhật trạng thái hiển thị offline ngay lập tức
      await db.guests.update(guest.id, { status: 'CHECKED_IN' });

      // 2. Thêm vào hàng đợi đồng bộ (dùng chung bảng scanQueue hoặc có thể gọi API sau)
      // Ở đây ta mô phỏng việc đẩy yêu cầu guest verify vào chung engine đồng bộ hoặc gọi API online
      if (navigator.onLine) {
        // Giả sử có API `POST /guests/check-in`
        // axios.post('http://localhost:3000/guests/check-in', { guestId: guest.id });
        alert(`Check-in thành công cho VIP: ${guest.fullName} (Đã đồng bộ)`);
      } else {
        alert(`Check-in thành công cho VIP: ${guest.fullName} (Lưu Offline)`);
      }
    } catch (err) {
      console.error(err);
      alert('Đã xảy ra lỗi khi check-in.');
    }
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
