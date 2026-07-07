import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../hooks/useAuth';

export default function OrderSuccess() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [circuitBreakerOpen, setCircuitBreakerOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const confirmOrder = async () => {
      try {
        const response = await axios.post(
          `http://localhost:3000/orders/${id}/confirm`,
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (isMounted) {
          setOrder(response.data);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Lỗi xác nhận thanh toán:', err);
        if (isMounted) {
          if (err.response?.status === 503) {
            setCircuitBreakerOpen(true);
          } else {
            setError(err.response?.data?.message || 'Có lỗi xảy ra trong quá trình xác nhận thanh toán.');
          }
          setLoading(false);
        }
      }
    };

    if (id && token) {
      confirmOrder();
    }

    return () => {
      isMounted = false;
    };
  }, [id, token]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        background: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '5px solid #e2e8f0',
          borderTop: '5px solid #2563eb',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '20px'
        }} />
        <h2 style={{ color: '#1e293b' }}>Đang xác nhận thanh toán...</h2>
        <p style={{ color: '#64748b' }}>Vui lòng không đóng trình duyệt hoặc tải lại trang.</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (circuitBreakerOpen) {
    return (
      <div style={{
        maxWidth: '600px',
        margin: '50px auto',
        padding: '30px',
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        textAlign: 'center',
        border: '1px solid #e2e8f0',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{ fontSize: '4rem', marginBottom: '20px' }}>⏳</div>
        <h2 style={{ color: '#d97706', marginBottom: '15px' }}>Đang Xử Lý Giao Dịch Trễ</h2>
        <div style={{
          background: '#fffbeb',
          borderLeft: '4px solid #f59e0b',
          color: '#b45309',
          padding: '15px',
          textAlign: 'left',
          borderRadius: '8px',
          marginBottom: '25px',
          lineHeight: '1.6'
        }}>
          <strong>Cổng thanh toán đang quá tải (Circuit Breaker Opened):</strong>
          <p style={{ margin: '5px 0 0 0' }}>
            Hệ thống đã ghi nhận việc thanh toán của bạn. Đơn hàng hiện được lưu dưới trạng thái <strong>PENDING</strong>. 
            Hệ thống tự động sẽ đối soát dữ liệu và phát hành vé QR ngay khi cổng thanh toán hoạt động trở lại. 
            Bạn không cần thực hiện thanh toán lại.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
          <Link to="/" style={{
            padding: '12px 24px',
            background: '#2563eb',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: 'bold'
          }}>Quay lại Trang chủ</Link>
          <button 
            onClick={() => window.location.reload()} 
            style={{
              padding: '12px 24px',
              background: '#f1f5f9',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >Thử kiểm tra lại</button>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{
        maxWidth: '600px',
        margin: '50px auto',
        padding: '30px',
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        textAlign: 'center',
        border: '1px solid #fee2e2',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{ fontSize: '4rem', marginBottom: '20px' }}>❌</div>
        <h2 style={{ color: '#dc2626', marginBottom: '15px' }}>Xác Nhận Thất Bại</h2>
        <p style={{ color: '#475569', marginBottom: '25px', lineHeight: '1.6' }}>
          {error || 'Không tìm thấy thông tin đơn hàng này hoặc bạn không có quyền truy cập.'}
        </p>
        <Link to="/" style={{
          padding: '12px 24px',
          background: '#2563eb',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '8px',
          fontWeight: 'bold'
        }}>Quay lại Trang chủ</Link>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '800px',
      margin: '40px auto',
      padding: '0 20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '64px',
          height: '64px',
          background: '#dcfce7',
          borderRadius: '50%',
          color: '#16a34a',
          fontSize: '2rem',
          marginBottom: '15px',
          boxShadow: '0 4px 10px rgba(22, 163, 74, 0.15)'
        }}>✓</div>
        <h1 style={{ fontSize: '2.2rem', color: '#0f172a', margin: '0 0 5px 0' }}>Thanh toán thành công!</h1>
        <p style={{ color: '#64748b', fontSize: '1.1rem', margin: 0 }}>Cảm ơn bạn đã mua vé. Dưới đây là vé điện tử của bạn.</p>
      </div>

      {/* Vé Điện Tử Render */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        {order.tickets?.map((ticket: any, index: number) => (
          <div key={ticket.id} style={{
            background: 'white',
            borderRadius: '20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 20px -5px rgba(0,0,0,0.05)',
            display: 'flex',
            overflow: 'hidden',
            flexWrap: 'wrap'
          }}>
            {/* Phần thông tin vé */}
            <div style={{
              flex: '1 1 450px',
              padding: '30px',
              background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)',
              color: 'white',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{
                  display: 'inline-block',
                  background: 'rgba(255, 255, 255, 0.15)',
                  padding: '6px 12px',
                  borderRadius: '30px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  marginBottom: '20px'
                }}>
                  VÉ ĐIỆN TỬ • TICKETBOX PASS
                </div>
                <h2 style={{ fontSize: '1.8rem', margin: '0 0 10px 0', fontWeight: 'bold', lineHeight: '1.3' }}>
                  {order.concert?.title || 'Concert Ticket'}
                </h2>
                <p style={{ margin: '0 0 20px 0', opacity: 0.8, fontSize: '0.95rem' }}>
                  📍 {order.concert?.venue}
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                borderTop: '1px solid rgba(255, 255, 255, 0.15)',
                paddingTop: '20px'
              }}>
                <div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6, textTransform: 'uppercase', marginBottom: '4px' }}>Thời gian</div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                    {order.concert?.startsAt ? new Date(order.concert.startsAt).toLocaleString('vi-VN') : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6, textTransform: 'uppercase', marginBottom: '4px' }}>Hạng vé</div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#38bdf8' }}>
                    {ticket.ticketType?.name || 'Standard'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6, textTransform: 'uppercase', marginBottom: '4px' }}>Mã vé</div>
                  <div style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                    {ticket.id.substring(0, 13).toUpperCase()}...
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6, textTransform: 'uppercase', marginBottom: '4px' }}>STT Vé</div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                    {index + 1} / {order.tickets.length}
                  </div>
                </div>
              </div>
            </div>

            {/* Dải phân cách răng cưa trang trí */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '20px',
              background: '#f8fafc',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: '-10px',
                left: '0',
                right: '0',
                height: '20px',
                borderRadius: '50%',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                zIndex: '2'
              }} />
              <div style={{
                borderLeft: '2px dashed #cbd5e1',
                height: '100%',
                margin: '10px 0'
              }} />
              <div style={{
                position: 'absolute',
                bottom: '-10px',
                left: '0',
                right: '0',
                height: '20px',
                borderRadius: '50%',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                zIndex: '2'
              }} />
            </div>

            {/* Phần hiển thị QR Code */}
            <div style={{
              flex: '1 1 250px',
              padding: '30px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#ffffff'
            }}>
              <div style={{
                padding: '15px',
                border: '2px solid #e2e8f0',
                borderRadius: '16px',
                background: 'white',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                display: 'inline-block'
              }}>
                <QRCodeSVG 
                  value={ticket.qrCode} 
                  size={150}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <div style={{
                marginTop: '15px',
                fontSize: '0.8rem',
                color: '#64748b',
                textAlign: 'center',
                lineHeight: '1.4'
              }}>
                Mã QR Soát Vé điện tử<br />
                <strong style={{ color: '#0f172a' }}>VUI LÒNG KHÔNG CHIA SẺ</strong>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '40px', marginBottom: '50px' }}>
        <Link to="/" style={{
          padding: '14px 28px',
          background: '#2563eb',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '8px',
          fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
          transition: 'all 0.2s'
        }}>
          Quay lại Trang chủ
        </Link>
        <Link to="/notifications" style={{
          padding: '14px 28px',
          background: '#f1f5f9',
          color: '#334155',
          textDecoration: 'none',
          borderRadius: '8px',
          fontWeight: 'bold',
          border: '1px solid #cbd5e1',
          transition: 'all 0.2s'
        }}>
          Xem Thông báo nhận vé
        </Link>
      </div>
    </div>
  );
}
