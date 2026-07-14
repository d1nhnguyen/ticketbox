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
    <div style={{ maxWidth: '600px', margin: '60px auto', padding: '30px', background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', textAlign: 'center' }}>
      {status === 'loading' && (
        <div>
          <div style={{ fontSize: '3rem', marginBottom: '20px' }}>⏳</div>
          <h2 style={{ color: '#4b5563', marginBottom: '10px' }}>{message}</h2>
          <p style={{ color: '#9ca3af' }}>Vui lòng không đóng trình duyệt lúc này.</p>
        </div>
      )}

      {status === 'success' && (
        <div>
          <div style={{ fontSize: '4rem', marginBottom: '20px' }}>✅</div>
          <h2 style={{ color: '#10b981', fontSize: '1.8rem', marginBottom: '15px' }}>{message}</h2>
          <p style={{ color: '#4b5563', marginBottom: '25px', lineHeight: '1.6' }}>
            Đơn hàng của bạn đã được xác nhận. Vé điện tử QR đã được phát hành thành công.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ padding: '12px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Xem vé của tôi
          </button>
        </div>
      )}

      {status === 'error' && (
        <div>
          <div style={{ fontSize: '4rem', marginBottom: '20px' }}>❌</div>
          <h2 style={{ color: '#ef4444', fontSize: '1.8rem', marginBottom: '15px' }}>Giao dịch không thành công</h2>
          <p style={{ color: '#4b5563', marginBottom: '25px', padding: '15px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fee2e2' }}>
            {message}
          </p>
          <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
            <button
              onClick={() => navigate('/')}
              style={{ padding: '12px 24px', background: 'white', color: '#4b5563', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Về trang chủ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
