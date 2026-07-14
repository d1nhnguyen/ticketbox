import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';

export default function Notifications() {
  const { token, role } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ⚠️ Hooks phải đặt TRƯỚC mọi early return (Rules of Hooks)
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await apiClient.get('/notifications', {
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

  // Early return SAU hooks
  if (!role) {
    return null; // ProtectedRoute will handle the redirect to /login
  }
  if (role !== 'AUDIENCE') {
    return <Navigate to="/" replace />;
  }

  const getNotificationDetails = (noti: any) => {
    let title = noti.payload?.title;
    let message = noti.payload?.message;
    let emoji = '📩';

    if (noti.type === 'ORDER_PAID') {
      title = 'Thanh toán vé thành công! 🎉';
      message = `Đơn hàng ${noti.payload?.orderId?.substring(0, 8)}... đã được thanh toán thành công với số tiền ${Number(noti.payload?.totalAmount || 0).toLocaleString('vi-VN')} VNĐ. Vé điện tử QR đã được phát hành!`;
      emoji = '🎟️';
    } else if (noti.type === 'REMINDER_24H') {
      title = noti.payload?.title || 'Nhắc nhở sự kiện sắp diễn ra ⏰';
      message = noti.payload?.message || 'Concert của bạn sẽ bắt đầu trong vòng 24 giờ tới. Hãy chuẩn bị sẵn vé QR!';
      emoji = '⏰';
    } else if (noti.type === 'CONCERT_CANCELLED') {
      const concertTitle = noti.payload?.concertTitle || 'concert';
      title = `Sự kiện "${concertTitle}" đã bị hủy ❌`;
      message = noti.payload?.message || `Rất tiếc, sự kiện "${concertTitle}" đã bị hủy. Vé của bạn sẽ được hoàn tiền trong thời gian sớm nhất.`;
      emoji = '🚫';
    } else if (noti.type === 'WARNING') {
      title = title || 'Cảnh báo hệ thống';
      emoji = '⚠️';
    }

    return { title: title || 'Thông báo mới', message: message || '', emoji };
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '20px', color: '#1f2937' }}>🔔 Hộp thư của bạn</h1>
      
      {loading ? (
        <p style={{ textAlign: 'center', color: '#6b7280' }}>Đang tải thông báo...</p>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          {notifications.length > 0 ? (
            notifications.map((noti: any) => {
              const { title, message, emoji } = getNotificationDetails(noti);
              const dateStr = noti.sentAt ? new Date(noti.sentAt).toLocaleString('vi-VN') : 'Vừa xong';
              return (
                <div key={noti.id} style={{ padding: '20px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '15px', alignItems: 'flex-start', background: noti.status === 'SENT' ? 'white' : '#f9fafb' }}>
                  <div style={{ fontSize: '1.8rem' }}>{emoji}</div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '5px', color: '#111827', fontWeight: 600 }}>{title}</h3>
                    <p style={{ color: '#4b5563', marginBottom: '10px', lineHeight: '1.5' }}>{message}</p>
                    <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{dateStr}</span>
                  </div>
                </div>
              );
            })
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