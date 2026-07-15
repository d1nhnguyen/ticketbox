import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Bell } from 'lucide-react';

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

    if (noti.type === 'ORDER_PAID') {
      title = 'Thanh toán vé thành công!';
      message = `Đơn hàng ${noti.payload?.orderId?.substring(0, 8)}... đã được thanh toán thành công với số tiền ${Number(noti.payload?.totalAmount || 0).toLocaleString('vi-VN')} VNĐ. Vé điện tử QR đã được phát hành!`;
    } else if (noti.type === 'REMINDER_24H') {
      title = noti.payload?.title || 'Nhắc nhở sự kiện sắp diễn ra';
      message = noti.payload?.message || 'Concert của bạn sẽ bắt đầu trong vòng 24 giờ tới. Hãy chuẩn bị sẵn vé QR!';
    } else if (noti.type === 'CONCERT_CANCELLED') {
      const concertTitle = noti.payload?.concertTitle || 'concert';
      title = `Sự kiện "${concertTitle}" đã bị hủy`;
      message = noti.payload?.message || `Rất tiếc, sự kiện "${concertTitle}" đã bị hủy. Vé của bạn sẽ được hoàn tiền trong thời gian sớm nhất.`;
    } else if (noti.type === 'WARNING') {
      title = title || 'Cảnh báo hệ thống';
    }

    return { title: title || 'Thông báo mới', message: message || '' };
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="page-header">
        <div className="page-title">Hộp thư của bạn</div>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          Đang tải thông báo...
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {notifications.length > 0 ? (
            notifications.map((noti: any) => {
              const { title, message } = getNotificationDetails(noti);
              const dateStr = noti.sentAt ? new Date(noti.sentAt).toLocaleString('vi-VN') : 'Vừa xong';
              return (
                <div key={noti.id} style={{
                  padding: 20, borderBottom: '1px solid var(--border)', display: 'flex', gap: 15, alignItems: 'flex-start',
                  background: noti.status === 'SENT' ? 'var(--surface)' : 'var(--surface-2)',
                }}>
                  <div className="stat-icon" style={{ marginTop: 2 }}><Bell size={16} /></div>
                  <div>
                    <h3 style={{ fontSize: 16, marginBottom: 5 }}>{title}</h3>
                    <p style={{ color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.5 }}>{message}</p>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{dateStr}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state">Bạn chưa có thông báo nào.</div>
          )}
        </div>
      )}
    </div>
  );
}
