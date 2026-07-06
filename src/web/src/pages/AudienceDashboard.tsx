import { useEffect, useState } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';

export default function AudienceDashboard() {
  const { token, role } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tickets' | 'history'>('tickets');
  const [selectedQr, setSelectedQr] = useState<{ code: string; title: string; type: string } | null>(null);

  // Chỉ Khán giả mới được vào trang này
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (role !== 'AUDIENCE') {
    return <Navigate to="/" replace />;
  }

  const fetchOrders = async () => {
    try {
      const res = await axios.get('http://localhost:3000/orders', {
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
    let bg = '#e2e8f0';
    let color = '#475569';
    let text = status;

    if (status === 'PAID') {
      bg = '#dcfce7';
      color = '#16a34a';
      text = 'Đã thanh toán';
    } else if (status === 'PENDING') {
      bg = '#fef3c7';
      color = '#d97706';
      text = 'Chờ thanh toán';
    } else if (status === 'EXPIRED') {
      bg = '#f1f5f9';
      color = '#94a3b8';
      text = 'Đã hết hạn';
    } else if (status === 'FAILED') {
      bg = '#fee2e2';
      color = '#dc2626';
      text = 'Thất bại';
    }

    return (
      <span style={{
        background: bg,
        color: color,
        padding: '5px 12px',
        borderRadius: '20px',
        fontSize: '0.85rem',
        fontWeight: 'bold'
      }}>
        {text}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ fontSize: '2.2rem', marginBottom: '8px', color: '#0f172a' }}>🎟️ Trang cá nhân của tôi</h1>
      <p style={{ color: '#64748b', marginBottom: '30px' }}>Quản lý vé xem concert và lịch sử thanh toán đơn hàng.</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #e2e8f0', marginBottom: '30px' }}>
        <button
          onClick={() => setActiveTab('tickets')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'tickets' ? '3px solid #2563eb' : '3px solid transparent',
            color: activeTab === 'tickets' ? '#2563eb' : '#64748b',
            fontWeight: 'bold',
            fontSize: '1.1rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: '-2px'
          }}
        >
          Vé của tôi ({paidTickets.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'history' ? '3px solid #2563eb' : '3px solid transparent',
            color: activeTab === 'history' ? '#2563eb' : '#64748b',
            fontWeight: 'bold',
            fontSize: '1.1rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: '-2px'
          }}
        >
          Lịch sử giao dịch ({orders.length})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Đang tải dữ liệu...</div>
      ) : (
        <div>
          {/* Tab 1: Vé của tôi */}
          {activeTab === 'tickets' && (
            <div>
              {paidTickets.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
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
                        borderRadius: '16px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
                      }}
                    >
                      <div style={{ padding: '20px', flexGrow: 1 }}>
                        <span style={{
                          fontSize: '0.75rem',
                          background: 'rgba(255, 255, 255, 0.15)',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          textTransform: 'uppercase',
                          fontWeight: 'bold',
                          letterSpacing: '0.5px'
                        }}>
                          TICKETBOX PASS
                        </span>
                        <h3 style={{ fontSize: '1.3rem', margin: '15px 0 5px 0', fontWeight: 'bold', lineHeight: '1.4' }}>
                          {ticket.concert?.title}
                        </h3>
                        <p style={{ fontSize: '0.85rem', margin: '0 0 15px 0', opacity: 0.8 }}>
                          📍 {ticket.concert?.venue}
                        </p>

                        <div style={{ borderTop: '1px dashed rgba(255, 255, 255, 0.2)', paddingTop: '15px', display: 'flex', justifyContent: 'space-between' }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block' }}>Hạng ghế</span>
                            <span style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '1.1rem' }}>{ticket.ticketType?.name}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.75rem', opacity: 0.6, display: 'block' }}>Thời gian</span>
                            <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                              {ticket.concert?.startsAt ? new Date(ticket.concert.startsAt).toLocaleDateString('vi-VN') : '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Phía dưới mô phỏng răng cưa */}
                      <div style={{
                        background: '#ffffff',
                        padding: '12px 20px',
                        color: '#4b5563',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '2px dashed #f3f4f6'
                      }}>
                        <span style={{ color: '#2563eb' }}>Xem mã QR →</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '60px 20px', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '3rem' }}>🎟️</span>
                  <h3 style={{ color: '#1e293b', marginTop: '15px' }}>Bạn chưa sở hữu vé nào</h3>
                  <p style={{ color: '#64748b', marginTop: '5px' }}>Hãy chọn và đặt mua vé ở trang chủ ngay thôi!</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Lịch sử giao dịch */}
          {activeTab === 'history' && (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              {orders.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '15px 20px', color: '#475569', fontWeight: 600 }}>Mã đơn hàng</th>
                        <th style={{ padding: '15px 20px', color: '#475569', fontWeight: 600 }}>Concert</th>
                        <th style={{ padding: '15px 20px', color: '#475569', fontWeight: 600 }}>Chi tiết vé</th>
                        <th style={{ padding: '15px 20px', color: '#475569', fontWeight: 600 }}>Tổng tiền</th>
                        <th style={{ padding: '15px 20px', color: '#475569', fontWeight: 600 }}>Trạng thái</th>
                        <th style={{ padding: '15px 20px', color: '#475569', fontWeight: 600 }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order: any) => {
                        const firstItem = order.items?.[0];
                        const detailsText = firstItem
                          ? `${firstItem.ticketType?.name || 'Vé'} x ${firstItem.quantity}`
                          : '—';
                        return (
                          <tr key={order.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '15px 20px', fontFamily: 'monospace', color: '#334155', fontSize: '0.9rem' }}>
                              {order.id.substring(0, 13)}...
                            </td>
                            <td style={{ padding: '15px 20px', fontWeight: 'bold', color: '#0f172a' }}>
                              {order.concert?.title || 'Sự kiện'}
                            </td>
                            <td style={{ padding: '15px 20px', color: '#4b5563' }}>
                              {detailsText}
                            </td>
                            <td style={{ padding: '15px 20px', fontWeight: 'bold', color: '#0f172a' }}>
                              {order.totalAmount.toLocaleString('vi-VN')} VNĐ
                            </td>
                            <td style={{ padding: '15px 20px' }}>
                              {getStatusBadge(order.status)}
                            </td>
                            <td style={{ padding: '15px 20px' }}>
                              {order.status === 'PENDING' && (
                                <button
                                  onClick={() => {
                                    window.location.href = `http://localhost:4000/pay?orderId=${order.id}&amount=${order.totalAmount}&concertSlug=${order.concert?.slug}`;
                                  }}
                                  style={{
                                    background: '#2563eb',
                                    color: 'white',
                                    padding: '6px 14px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem'
                                  }}
                                >
                                  Thanh toán ngay
                                </button>
                              )}
                              {order.status === 'PAID' && (
                                <span style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '0.85rem' }}>✓ Hoàn tất</span>
                              )}
                              {order.status !== 'PAID' && order.status !== 'PENDING' && (
                                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                  <p style={{ fontSize: '3rem', marginBottom: '10px' }}>🛒</p>
                  <p>Bạn chưa thực hiện giao dịch nào.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal hiển thị QR Code */}
      {selectedQr && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }} onClick={() => setSelectedQr(null)}>
          <div style={{
            background: 'white',
            borderRadius: '24px',
            padding: '40px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
            textAlign: 'center',
            border: '1px solid #e2e8f0',
            position: 'relative'
          }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedQr(null)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: '#f1f5f9',
                border: 'none',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                cursor: 'pointer',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>
            <h3 style={{ fontSize: '1.4rem', color: '#0f172a', margin: '0 0 5px 0' }}>Vé soát cửa của bạn</h3>
            <p style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '1.1rem', margin: '0 0 8px 0', textTransform: 'uppercase' }}>
              {selectedQr.type}
            </p>
            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 0 25px 0' }}>
              {selectedQr.title}
            </p>

            <div style={{
              background: '#f8fafc',
              padding: '20px',
              borderRadius: '16px',
              border: '2px solid #e2e8f0',
              display: 'inline-block',
              marginBottom: '20px'
            }}>
              <QRCodeSVG
                value={selectedQr.code}
                size={220}
                level="H"
                includeMargin={true}
              />
            </div>

            <p style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 'bold', margin: '0 0 5px 0' }}>
              ⚠️ CẢNH BÁO BẢO MẬT
            </p>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0, lineHeight: '1.4' }}>
              Không chia sẻ mã QR này với bất kỳ ai để tránh bị quét vé giả hoặc mất quyền check-in.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
