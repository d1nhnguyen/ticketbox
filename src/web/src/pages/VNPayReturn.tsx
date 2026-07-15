import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';

export default function VNPayReturn() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Đang xử lý kết quả thanh toán từ VNPay...');

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        // Send the entire query string to the backend for verification
        const queryString = searchParams.toString();
        const res = await apiClient.get(`/orders/vnpay/return?${queryString}`);

        if (res.data.success) {
          setStatus('success');
          setMessage('Thanh toán thành công!');
        } else {
          setStatus('error');
          setMessage(`Thanh toán thất bại: ${res.data.message || 'Lỗi không xác định'}`);

          // Tự động giải phóng order nếu user hủy/thất bại để nhả vé
          if (res.data.data?.orderId) {
            try {
              const token = localStorage.getItem('token');
              if (token) {
                await apiClient.post(`/orders/${res.data.data.orderId}/fail`, {}, {
                  headers: { Authorization: `Bearer ${token}` }
                });
              }
            } catch (e) {
              console.error('Failed to release order after VNPay error', e);
            }
          }
        }
      } catch (err: any) {
        setStatus('error');
        setMessage('Có lỗi xảy ra khi xác thực thanh toán với server.');
        console.error(err);
      }
    };

    verifyPayment();
  }, [searchParams]);

  return (
    <div className="card" style={{ maxWidth: 600, margin: '60px auto', padding: 30, textAlign: 'center' }}>
      {status === 'loading' && (
        <div>
          <div className="spinner" style={{ margin: '0 auto 20px' }} />
          <h2 style={{ marginBottom: 10 }}>{message}</h2>
          <p style={{ color: 'var(--text-3)' }}>Vui lòng không đóng trình duyệt lúc này.</p>
        </div>
      )}

      {status === 'success' && (
        <div>
          <h2 style={{ color: 'var(--success)', fontSize: 22, marginBottom: 15 }}>{message}</h2>
          <p style={{ color: 'var(--text-2)', marginBottom: 25, lineHeight: 1.6 }}>
            Đơn hàng của bạn đã được xác nhận. Vé điện tử QR đã được phát hành thành công.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>Xem vé của tôi</button>
        </div>
      )}

      {status === 'error' && (
        <div>
          <h2 style={{ color: 'var(--danger)', fontSize: 22, marginBottom: 15 }}>Giao dịch không thành công</h2>
          <div className="alert alert-danger" style={{ marginBottom: 25 }}>{message}</div>
          <div style={{ display: 'flex', gap: 15, justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>Về trang chủ</button>
          </div>
        </div>
      )}
    </div>
  );
}
