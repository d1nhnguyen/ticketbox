import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { X, Ticket, ShoppingCart, AlertTriangle } from 'lucide-react';

export default function AudienceDashboard() {
  const { token, role } = useAuth();
  const { vnpayEnabled } = usePaymentMethods();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tickets' | 'history'>('tickets');
  const [selectedQr, setSelectedQr] = useState<{ code: string; title: string; type: string } | null>(null);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);

  // Chỉ Khán giả mới được vào trang này
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (role !== 'AUDIENCE') {
    return <Navigate to="/" replace />;
  }

  const fetchOrders = async () => {
    try {
      const res = await apiClient.get('/orders', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(res.data);
    } catch (err) {
      console.error("Lỗi tải danh sách đơn hàng:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [token]);

  const handlePayment = async (order: any, method: 'VNPAY' | 'MOCK') => {
    if (method === 'VNPAY' && !vnpayEnabled) return;
    setPayingOrderId(order.id);
    try {
      if (method === 'VNPAY') {
        const vnpayRes = await apiClient.get(
          `/orders/vnpay/url/${order.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        window.location.href = vnpayRes.data.url;
      } else {
        window.location.href = `http://localhost:4000/pay?orderId=${order.id}&amount=${order.totalAmount}&concertSlug=${order.concert?.slug}`;
      }
    } catch (err: any) {
      alert('Có lỗi xảy ra khi tạo link thanh toán: ' + (err.response?.data?.message || err.message));
      setPayingOrderId(null);
    }
  };

  // Lấy danh sách tất cả các vé từ các đơn hàng đã thanh toán (PAID)
  const paidTickets = orders
    .filter(order => order.status === 'PAID')
    .flatMap(order =>
      (order.tickets || []).map((ticket: any) => ({
        ...ticket,
        concert: order.concert,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt
      }))
    );

  const getStatusBadge = (status: string) => {
    if (status === 'PAID') return <span className="badge badge-success">Đã thanh toán</span>;
    if (status === 'PENDING') return <span className="badge badge-warning">Chờ thanh toán</span>;
    if (status === 'EXPIRED') return <span className="badge badge-muted">Đã hết hạn</span>;
    if (status === 'FAILED') return <span className="badge badge-danger">Thất bại</span>;
    return <span className="badge badge-muted">{status}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Trang cá nhân của tôi</div>
          <div className="page-subtitle">Quản lý vé xem concert và lịch sử thanh toán đơn hàng.</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab${activeTab === 'tickets' ? ' active' : ''}`} onClick={() => setActiveTab('tickets')}>
          Vé của tôi ({paidTickets.length})
        </button>
        <button className={`tab${activeTab === 'history' ? ' active' : ''}`} onClick={() => setActiveTab('history')}>
          Lịch sử giao dịch ({orders.length})
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          Đang tải dữ liệu...
        </div>
      ) : (
        <div>
          {/* Tab 1: Vé của tôi */}
          {activeTab === 'tickets' && (
            <div>
              {paidTickets.length > 0 ? (
                <div className="grid-cards">
                  {paidTickets.map((ticket: any) => (
                    <div
                      key={ticket.id}
                      onClick={() => setSelectedQr({
                        code: ticket.qrCode,
                        title: ticket.concert?.title,
                        type: ticket.ticketType?.name
                      })}
                      style={{
                        background: 'linear-gradient(135deg, #1e1b4b 0%, #3b0764 100%)',
                        color: 'white',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        boxShadow: 'var(--shadow-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      <div style={{ padding: 20, flexGrow: 1 }}>
                        <span style={{
                          fontSize: 12,
                          background: 'rgba(255, 255, 255, 0.15)',
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-full)',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          letterSpacing: '0.5px'
                        }}>
                          TICKETBOX PASS
                        </span>
                        <h3 style={{ fontSize: 20, color: 'white', margin: '15px 0 5px 0', lineHeight: 1.4 }}>
                          {ticket.concert?.title}
                        </h3>
                        <p style={{ fontSize: 13, margin: '0 0 15px 0', opacity: 0.8 }}>
                          {ticket.concert?.venue}
                        </p>

                        <div style={{ borderTop: '1px dashed rgba(255, 255, 255, 0.2)', paddingTop: 15, display: 'flex', justifyContent: 'space-between' }}>
                          <div>
                            <span style={{ fontSize: 12, opacity: 0.6, display: 'block' }}>Hạng ghế</span>
                            <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: 17 }}>{ticket.ticketType?.name}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 12, opacity: 0.6, display: 'block' }}>Thời gian</span>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>
                              {ticket.concert?.startsAt ? new Date(ticket.concert.startsAt).toLocaleDateString('vi-VN') : '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Phía dưới mô phỏng răng cưa */}
                      <div style={{
                        background: 'var(--surface)',
                        padding: '12px 20px',
                        color: 'var(--text-2)',
                        fontSize: 13,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '2px dashed var(--border)',
                      }}>
                        <span style={{ color: 'var(--primary)' }}>Xem mã QR →</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <Ticket className="empty-state-icon" />
                  <h3 style={{ color: 'var(--text)', marginTop: 15 }}>Bạn chưa sở hữu vé nào</h3>
                  <p style={{ marginTop: 5 }}>Hãy chọn và đặt mua vé ở trang chủ ngay thôi!</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Lịch sử giao dịch */}
          {activeTab === 'history' && (
            <div>
              {orders.length > 0 ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Mã đơn hàng</th>
                        <th>Concert</th>
                        <th>Chi tiết vé</th>
                        <th>Tổng tiền</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order: any) => {
                        const firstItem = order.items?.[0];
                        const detailsText = firstItem
                          ? `${firstItem.ticketType?.name || 'Vé'} x ${firstItem.quantity}`
                          : '—';
                        return (
                          <tr key={order.id}>
                            <td style={{ fontFamily: 'monospace', fontSize: 13 }}>
                              {order.id.substring(0, 13)}...
                            </td>
                            <td style={{ fontWeight: 700 }}>
                              {order.concert?.title || 'Sự kiện'}
                            </td>
                            <td>{detailsText}</td>
                            <td style={{ fontWeight: 700 }}>
                              {order.totalAmount.toLocaleString('vi-VN')} VNĐ
                            </td>
                            <td>{getStatusBadge(order.status)}</td>
                            <td>
                              {order.status === 'PENDING' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {vnpayEnabled && (
                                    <button
                                      className="btn btn-primary btn-sm"
                                      onClick={() => handlePayment(order, 'VNPAY')}
                                      disabled={payingOrderId === order.id}
                                    >
                                      {payingOrderId === order.id ? 'Đang tải...' : 'Thanh toán (VNPay)'}
                                    </button>
                                  )}
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handlePayment(order, 'MOCK')}
                                    disabled={payingOrderId === order.id}
                                  >
                                    Thanh toán (Mock)
                                  </button>
                                </div>
                              )}
                              {order.status === 'PAID' && (
                                <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: 13 }}>✓ Hoàn tất</span>
                              )}
                              {order.status !== 'PAID' && order.status !== 'PENDING' && (
                                <span style={{ color: 'var(--text-3)', fontSize: 13 }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <ShoppingCart className="empty-state-icon" />
                  Bạn chưa thực hiện giao dịch nào.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal hiển thị QR Code */}
      {selectedQr && (
        <div className="modal-backdrop" onClick={() => setSelectedQr(null)}>
          <div className="modal" style={{ maxWidth: 400, padding: 40, textAlign: 'center', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedQr(null)}
              style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: '50%', padding: 0 }}
            >
              <X size={16} />
            </button>
            <h3 style={{ fontSize: 20, margin: '0 0 5px 0' }}>Vé soát cửa của bạn</h3>
            <p style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 17, margin: '0 0 8px 0', textTransform: 'uppercase' }}>
              {selectedQr.type}
            </p>
            <p style={{ color: 'var(--text-2)', fontSize: 14, margin: '0 0 25px 0' }}>
              {selectedQr.title}
            </p>

            <div style={{
              background: 'var(--surface-2)',
              padding: 20,
              borderRadius: 'var(--radius-lg)',
              border: '2px solid var(--border)',
              display: 'inline-block',
              marginBottom: 20
            }}>
              <QRCodeSVG value={selectedQr.code} size={220} level="H" includeMargin={true} />
            </div>

            <p style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 700, margin: '0 0 5px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <AlertTriangle size={14} /> CẢNH BÁO BẢO MẬT
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.4 }}>
              Không chia sẻ mã QR này với bất kỳ ai để tránh bị quét vé giả hoặc mất quyền check-in.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
