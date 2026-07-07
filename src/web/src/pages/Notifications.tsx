import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';

export default function Notifications() {
  const { token, role } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Chỉ Khán giả mới được vào trang này
  if (role !== 'AUDIENCE') {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await axios.get('http://localhost:3000/notifications', {
          headers: { Authorization: `Bearer ${token}` }
        });

        const rows = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
        const normalized = rows.map((item: any) => {
          const payload = item.payload ?? {};
          const title = item.title ?? payload.title ?? payload.message ?? 'Thông báo';
          const message = item.message ?? payload.message ?? payload.body ?? '';
          return {
            ...item,
            title,
            message,
            isRead: Boolean(item.isRead ?? payload.isRead ?? false),
            type: item.type ?? payload.type ?? 'INFO',
            createdAt: item.createdAt ?? payload.createdAt ?? new Date().toISOString(),
          };
        });

        setNotifications(normalized);
      } catch (err) {
        console.error('Lỗi tải thông báo:', err);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchNotifications();
    }
  }, [token]);

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '20px', color: '#1f2937' }}>🔔 Hộp thư của bạn</h1>
      
      {loading ? (
        <p style={{ textAlign: 'center', color: '#6b7280' }}>Đang tải thông báo...</p>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          {notifications.length > 0 ? (
            notifications.map((noti: any) => (
              <div key={noti.id} style={{ padding: '20px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '15px', alignItems: 'flex-start', background: noti.isRead ? 'white' : '#f0fdf4' }}>
                <div style={{ fontSize: '1.5rem' }}>{noti.type === 'SUCCESS' ? '✅' : noti.type === 'WARNING' ? '⚠️' : '📩'}</div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '5px', color: noti.isRead ? '#4b5563' : '#111827' }}>{noti.title}</h3>
                  <p style={{ color: '#6b7280', marginBottom: '10px' }}>{noti.message}</p>
                  <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{new Date(noti.createdAt).toLocaleString('vi-VN')}</span>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
              <p style={{ fontSize: '3rem', marginBottom: '10px' }}>📭</p>
              <p>Bạn chưa có thông báo nào.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}