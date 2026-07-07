import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

import { useAuth } from '../hooks/useAuth';

export default function ConcertDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token, role } = useAuth();
  
  const [concert, setConcert] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [issuedTickets, setIssuedTickets] = useState<any[]>([]);

  // 1. CƠ CHẾ POLLING (Cập nhật số lượng vé Real-time)
  useEffect(() => {
    let isMounted = true;
    
    const fetchConcert = async () => {
      try {
        const res = await axios.get(`http://localhost:3000/concerts/${slug}`);
        if (isMounted) {
          setConcert(res.data);
          setLoading(false); // Chỉ tắt loading ở lần gọi đầu tiên để UI không bị giật
        }
      } catch (err) {
        console.error("Lỗi fetch concert:", err);
        if (isMounted) setLoading(false);
      }
    };

    // Gọi lần đầu
    fetchConcert();

    // Thiết lập Polling gọi lại API mỗi 5 giây
    const intervalId = setInterval(fetchConcert, 5000);

    // Dọn dẹp interval khi người dùng rời khỏi trang
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [slug]);

  const handleQuantityChange = (ticketId: string, delta: number, maxPerUser: number, remainingQty: number) => {
    setQuantities(prev => {
      const current = prev[ticketId] || 0;
      const next = current + delta;
      if (next < 0 || next > remainingQty || next > maxPerUser) return prev;
      return { ...prev, [ticketId]: next };
    });
  };

  const totalAmount = concert?.ticketTypes?.reduce((sum: number, ticket: any) => {
    return sum + (quantities[ticket.id] || 0) * ticket.price;
  }, 0) || 0;

  const totalTickets = Object.values(quantities).reduce((a, b) => a + b, 0);

  const handleCheckout = async () => {
    if (!token) {
      alert('Vui lòng đăng nhập để mua vé!');
      navigate('/login');
      return;
    }
    if (role !== 'AUDIENCE') {
      setCheckoutError('Chỉ tài khoản Khán giả (AUDIENCE) mới có thể mua vé.');
      return;
    }

    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));

    if (items.length === 0) return;

    setIsCheckingOut(true);
    setCheckoutError('');

    const authHeader = { Authorization: `Bearer ${token}` };
    const allTickets: any[] = [];

    try {
      for (const item of items) {
        const orderRes = await axios.post(
          'http://localhost:3000/orders',
          item,
          {
            headers: {
              ...authHeader,
              'Idempotency-Key': crypto.randomUUID(),
            },
          }
        );

        const orderId = orderRes.data.id;
        const confirmRes = await axios.post(
          `http://localhost:3000/orders/${orderId}/confirm`,
          {},
          { headers: authHeader }
        );

        allTickets.push(...(confirmRes.data?.tickets ?? []));
      }

      setIssuedTickets(allTickets);
      setQuantities({});
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 409) setCheckoutError('Rất tiếc! Số lượng vé bạn chọn vừa bị mua hết (Oversell Protection).');
      else if (status === 400) setCheckoutError('Vượt quá giới hạn vé/tài khoản, hoặc thanh toán thất bại.');
      else if (status === 503) setCheckoutError('Cổng thanh toán đang quá tải (Circuit Breaker mở). Vui lòng thử lại sau!');
      else if (status === 429) setCheckoutError('Bạn thao tác quá nhanh (Rate Limit). Vui lòng chậm lại.');
      else setCheckoutError('Đã xảy ra lỗi không xác định. Vui lòng thử lại!');
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (loading) return <div style={{ padding: '50px', textAlign: 'center', fontSize: '1.2rem' }}>⏳ Đang tải dữ liệu thực tế...</div>;
  if (!concert) return <div style={{ padding: '50px', textAlign: 'center', color: 'red' }}>Không tìm thấy Concert!</div>;

  if (issuedTickets.length > 0) {
    return (
      <div style={{ maxWidth: '700px', margin: '40px auto', padding: '20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '10px' }}>🎉 Thanh toán thành công!</h1>
        <p style={{ color: '#4b5563', marginBottom: '24px' }}>Vui lòng xuất trình mã QR dưới đây tại cổng sự kiện.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', justifyContent: 'center' }}>
          {issuedTickets.map((ticket) => (
            <div key={ticket.id} style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
              <QRCodeSVG value={ticket.qrCode} size={180} />
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#6b7280' }}>{ticket.qrCode}</div>
            </div>
          ))}
        </div>
        <Link to="/" style={{ display: 'inline-block', marginTop: '24px', color: '#2563eb', fontWeight: 'bold' }}>← Về trang chủ</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '30px 20px' }}>
      <Link to="/" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 'bold' }}>← Quay lại danh sách</Link>
      
      <div style={{ marginTop: '30px', background: 'white', padding: '30px', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '10px' }}>{concert.title}</h1>
        <p style={{ fontSize: '1.1rem', color: '#4b5563', marginBottom: '30px' }}>📍 {concert.venue} &nbsp;|&nbsp; ⏰ {new Date(concert.startsAt).toLocaleString('vi-VN')}</p>

        {checkoutError && (
          <div style={{ background: '#fee2e2', borderLeft: '4px solid #ef4444', color: '#b91c1c', padding: '15px', marginBottom: '25px', borderRadius: '4px' }}>
            <strong>Lỗi thanh toán:</strong> {checkoutError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
          
          {/* Cột trái: 2. BẢN ĐỒ SVG TƯƠNG TÁC */}
          <div style={{ flex: '1 1 500px', background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '20px', color: '#334155', textAlign: 'center' }}>Sơ đồ & Tình trạng ghế</h3>
            
            <svg viewBox="0 0 800 600" style={{ width: '100%', height: '100%', minHeight: '400px', userSelect: 'none' }}>
              {/* Vẽ Sân Khấu (Stage) */}
              <rect x="250" y="20" width="300" height="80" rx="15" fill="#1e293b" />
              <text x="400" y="65" fill="white" fontSize="26" fontWeight="bold" textAnchor="middle" letterSpacing="2">SÂN KHẤU</text>

              {/* Render linh hoạt các khu vực ghế ngồi dựa trên dữ liệu thật của API */}
              {concert.ticketTypes?.map((ticket: any, index: number) => {
                const isSoldOut = ticket.remainingQty === 0;
                const qtySelected = quantities[ticket.id] || 0;
                const isSelected = qtySelected > 0;
                
                // Toán học để tự động xếp các khu vực thành 2 cột (Trái/Phải) và dồn dần về phía sau
                const row = Math.floor(index / 2);
                const col = index % 2;
                const width = 300;
                const height = 110;
                const x = col === 0 ? 80 : 420;
                const y = 140 + (row * 140);

                // Logic Màu sắc: Xám (Hết vé), Xanh đậm (Đang chọn), Xanh nhạt (Còn trống)
                let fillColor = '#bae6fd'; 
                let textColor = '#0369a1';
                let strokeColor = '#7dd3fc';

                if (isSoldOut) {
                  fillColor = '#f1f5f9';
                  textColor = '#94a3b8';
                  strokeColor = '#cbd5e1';
                } else if (isSelected) {
                  fillColor = '#3b82f6';
                  textColor = '#ffffff';
                  strokeColor = '#1d4ed8';
                }

                return (
                  <g 
                    key={ticket.id} 
                    onClick={() => {
                      if (!isSoldOut && qtySelected < ticket.maxPerUser) {
                        // Tăng số lượng vé lên 1 khi click vào bản đồ
                        handleQuantityChange(ticket.id, 1, ticket.maxPerUser, ticket.remainingQty);
                      }
                    }} 
                    style={{ cursor: isSoldOut ? 'not-allowed' : 'pointer', transition: 'all 0.2s ease-in-out' }}
                  >
                    <rect x={x} y={y} width={width} height={height} rx="12" fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 4 : 2} />
                    <text x={x + width/2} y={y + 45} fill={textColor} fontSize="22" fontWeight="bold" textAnchor="middle">{ticket.name}</text>
                    <text x={x + width/2} y={y + 75} fill={isSelected ? '#bfdbfe' : textColor} fontSize="16" textAnchor="middle">
                      {isSoldOut ? 'HẾT VÉ' : `Còn trống: ${ticket.remainingQty}`}
                    </text>
                    {isSelected && (
                      <circle cx={x + width - 25} cy={y + 25} r="15" fill="#10b981" />
                    )}
                    {isSelected && (
                      <text x={x + width - 25} y={y + 31} fill="white" fontSize="16" fontWeight="bold" textAnchor="middle">{qtySelected}</text>
                    )}
                  </g>
                );
              })}
            </svg>
            <p style={{ textAlign: 'center', fontSize: '0.9rem', color: '#64748b', marginTop: '15px' }}>
              * Bấm trực tiếp vào khu vực trên bản đồ để chọn vé nhanh
            </p>
          </div>

          {/* Cột phải: Danh sách vé & Mua hàng */}
          <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Giỏ hàng của bạn</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', flexGrow: 1 }}>
              {concert.ticketTypes?.map((ticket: any) => {
                const qty = quantities[ticket.id] || 0;
                const isSoldOut = ticket.remainingQty === 0;

                return (
                  <div key={ticket.id} style={{ padding: '15px', border: qty > 0 ? '2px solid #3b82f6' : '1px solid #e5e7eb', borderRadius: '10px', background: isSoldOut ? '#f9fafb' : 'white', transition: 'all 0.2s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: isSoldOut ? '#9ca3af' : '#111827' }}>{ticket.name}</div>
                        <div style={{ color: isSoldOut ? '#9ca3af' : '#ef4444', fontWeight: 'bold', marginTop: '5px' }}>
                          {ticket.price.toLocaleString('vi-VN')} VNĐ
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '0.85rem', color: '#6b7280' }}>
                        <div>Còn lại: <strong style={{ color: isSoldOut ? '#ef4444' : '#059669' }}>{ticket.remainingQty}</strong></div>
                        <div>Giới hạn: <strong>{ticket.maxPerUser}/người</strong></div>
                      </div>
                    </div>

                    {!isSoldOut && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '15px', borderTop: '1px dashed #e5e7eb', paddingTop: '15px' }}>
                        <button 
                          onClick={() => handleQuantityChange(ticket.id, -1, ticket.maxPerUser, ticket.remainingQty)}
                          disabled={qty === 0}
                          style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #d1d5db', background: qty === 0 ? '#f3f4f6' : 'white', cursor: qty === 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
                        <span style={{ fontWeight: 'bold', fontSize: '1.2rem', width: '30px', textAlign: 'center' }}>{qty}</span>
                        <button 
                          onClick={() => handleQuantityChange(ticket.id, 1, ticket.maxPerUser, ticket.remainingQty)}
                          disabled={qty >= ticket.maxPerUser || qty >= ticket.remainingQty}
                          style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #d1d5db', background: (qty >= ticket.maxPerUser || qty >= ticket.remainingQty) ? '#f3f4f6' : 'white', cursor: (qty >= ticket.maxPerUser || qty >= ticket.remainingQty) ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      </div>
                    )}
                    {isSoldOut && <div style={{ marginTop: '10px', color: '#ef4444', fontWeight: 'bold', textAlign: 'center', padding: '10px 0', background: '#fee2e2', borderRadius: '6px' }}>ĐÃ BÁN HẾT</div>}
                  </div>
                );
              })}
            </div>

            {/* Thanh toán Box */}
            <div style={{ marginTop: '25px', padding: '25px', background: '#0f172a', borderRadius: '12px', color: 'white', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontSize: '1.1rem', color: '#94a3b8' }}>
                <span>Tổng số lượng vé:</span>
                <span style={{ fontWeight: 'bold', color: 'white' }}>{totalTickets} vé</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px', fontSize: '1.4rem' }}>
                <span>Tổng tiền:</span>
                <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>{totalAmount.toLocaleString('vi-VN')} VNĐ</span>
              </div>
              <button 
                onClick={handleCheckout}
                disabled={totalTickets === 0 || isCheckingOut}
                style={{ width: '100%', padding: '16px', background: (totalTickets === 0 || isCheckingOut) ? '#334155' : '#2563eb', color: (totalTickets === 0 || isCheckingOut) ? '#94a3b8' : 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.2rem', cursor: (totalTickets === 0 || isCheckingOut) ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}>
                {isCheckingOut ? 'Đang kết nối cổng thanh toán...' : 'THANH TOÁN NGAY'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}