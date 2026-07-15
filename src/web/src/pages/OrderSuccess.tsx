import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../api/client';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../hooks/useAuth';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';

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
        const response = await apiClient.post(
          `/orders/${id}/confirm`,
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
        <div className="spinner" style={{ width: 50, height: 50, borderWidth: 5, marginBottom: 20 }} />
        <h2>Đang xác nhận thanh toán...</h2>
        <p style={{ color: 'var(--text-2)' }}>Vui lòng không đóng trình duyệt hoặc tải lại trang.</p>
      </div>
    );
  }

  if (circuitBreakerOpen) {
    return (
      <div className="card" style={{ maxWidth: 600, margin: '50px auto', padding: 30, textAlign: 'center' }}>
        <Clock size={48} style={{ color: 'var(--warning)', margin: '0 auto 20px' }} />
        <h2 style={{ color: 'var(--warning)', marginBottom: 15 }}>Đang Xử Lý Giao Dịch Trễ</h2>
        <div className="alert alert-warning" style={{ textAlign: 'left', marginBottom: 25, lineHeight: 1.6 }}>
          <strong>Cổng thanh toán đang quá tải (Circuit Breaker Opened):</strong>
          <p style={{ margin: '5px 0 0 0' }}>
            Hệ thống đã ghi nhận việc thanh toán của bạn. Đơn hàng hiện được lưu dưới trạng thái <strong>PENDING</strong>.
            Hệ thống tự động sẽ đối soát dữ liệu và phát hành vé QR ngay khi cổng thanh toán hoạt động trở lại.
            Bạn không cần thực hiện thanh toán lại.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 15, justifyContent: 'center' }}>
          <Link to="/" className="btn btn-primary">Quay lại Trang chủ</Link>
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>Thử kiểm tra lại</button>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="card" style={{ maxWidth: 600, margin: '50px auto', padding: 30, textAlign: 'center', borderColor: 'var(--danger-border)' }}>
        <XCircle size={48} style={{ color: 'var(--danger)', margin: '0 auto 20px' }} />
        <h2 style={{ color: 'var(--danger)', marginBottom: 15 }}>Xác Nhận Thất Bại</h2>
        <p style={{ color: 'var(--text-2)', marginBottom: 25, lineHeight: 1.6 }}>
          {error || 'Không tìm thấy thông tin đơn hàng này hoặc bạn không có quyền truy cập.'}
        </p>
        <Link to="/" className="btn btn-primary">Quay lại Trang chủ</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64,
          background: 'var(--success-bg)', borderRadius: '50%', color: 'var(--success)', marginBottom: 15,
        }}>
          <CheckCircle2 size={32} />
        </div>
        <h1 style={{ fontSize: 26 }}>Thanh toán thành công!</h1>
        <p style={{ color: 'var(--text-2)', fontSize: 16, marginTop: 5 }}>Cảm ơn bạn đã mua vé. Dưới đây là vé điện tử của bạn.</p>
      </div>

      {/* Vé Điện Tử Render */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
        {order.tickets?.map((ticket: any, index: number) => (
          <div key={ticket.id} className="card" style={{ display: 'flex', overflow: 'hidden', flexWrap: 'wrap' }}>
            {/* Phần thông tin vé */}
            <div style={{
              flex: '1 1 450px', padding: 30, background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)',
              color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{
                  display: 'inline-block', background: 'rgba(255, 255, 255, 0.15)', padding: '6px 12px',
                  borderRadius: 30, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 20,
                }}>
                  VÉ ĐIỆN TỬ • TICKETBOX PASS
                </div>
                <h2 style={{ fontSize: 24, color: 'white', margin: '0 0 10px 0', lineHeight: 1.3 }}>
                  {order.concert?.title || 'Concert Ticket'}
                </h2>
                <p style={{ margin: '0 0 20px 0', opacity: 0.8, fontSize: 15 }}>{order.concert?.venue}</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, borderTop: '1px solid rgba(255, 255, 255, 0.15)', paddingTop: 20 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>Thời gian</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {order.concert?.startsAt ? new Date(order.concert.startsAt).toLocaleString('vi-VN') : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>Hạng vé</div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: '#38bdf8' }}>{ticket.ticketType?.name || 'Standard'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>Mã vé</div>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 14 }}>
                    {ticket.id.substring(0, 13).toUpperCase()}...
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>STT Vé</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{index + 1} / {order.tickets.length}</div>
                </div>
              </div>
            </div>

            {/* Dải phân cách răng cưa trang trí */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', width: 20, background: 'var(--surface-2)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: -10, left: 0, right: 0, height: 20, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', zIndex: 2 }} />
              <div style={{ borderLeft: '2px dashed var(--border-strong)', height: '100%', margin: '10px 0' }} />
              <div style={{ position: 'absolute', bottom: -10, left: 0, right: 0, height: 20, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', zIndex: 2 }} />
            </div>

            {/* Phần hiển thị QR Code */}
            <div style={{ flex: '1 1 250px', padding: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)' }}>
              <div style={{ padding: 15, border: '2px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--surface)', boxShadow: 'var(--shadow-xs)', display: 'inline-block' }}>
                <QRCodeSVG value={ticket.qrCode} size={150} level="H" includeMargin={true} />
              </div>
              <div style={{ marginTop: 15, fontSize: 12, color: 'var(--text-2)', textAlign: 'center', lineHeight: 1.4 }}>
                Mã QR Soát Vé điện tử<br />
                <strong style={{ color: 'var(--text)' }}>VUI LÒNG KHÔNG CHIA SẺ</strong>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 40, marginBottom: 50 }}>
        <Link to="/" className="btn btn-primary">Quay lại Trang chủ</Link>
        <Link to="/notifications" className="btn btn-secondary">Xem Thông báo nhận vé</Link>
      </div>
    </div>
  );
}
