import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../api/client';
import { QRCodeSVG } from 'qrcode.react';
import DOMPurify from 'dompurify';

import { useAuth } from '../hooks/useAuth';
import { usePaymentMethods } from '../hooks/usePaymentMethods';

export default function ConcertDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token, role } = useAuth();
  const { vnpayEnabled } = usePaymentMethods();

  const [concert, setConcert] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [issuedTickets] = useState<any[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'VNPAY' | 'MOCK'>('MOCK');
  const seatMapRef = useRef<HTMLDivElement>(null);

  // Hiển thị lỗi từ cổng thanh toán truyền về nếu có và hủy order ngay lập tức để giải phóng vé
  useEffect(() => {
    const errorParam = searchParams.get('payment_error');
    const orderId = searchParams.get('orderId');

    if (errorParam) {
      if (errorParam === 'failed') {
        setCheckoutError('Thanh toán không thành công tại cổng thanh toán. Vui lòng thử lại.');
      } else if (errorParam === 'cancelled') {
        setCheckoutError('Bạn đã hủy giao dịch thanh toán. Vé của bạn đã được giải phóng trở lại.');
      }

      if (orderId && token) {
        apiClient.post(`/orders/${orderId}/fail`, {}, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }).catch(err => {
          console.error("Lỗi khi hủy đơn hàng chủ động:", err);
        });
      }
    }
  }, [searchParams, token]);

  // 1. CƠ CHẾ POLLING (Cập nhật số lượng vé Real-time)
  useEffect(() => {
    let isMounted = true;

    const fetchConcert = async () => {
      try {
        const res = await apiClient.get(`/concerts/${slug}`);
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

  const activeTicketTypeId = Object.entries(quantities).find(([_, qty]) => qty > 0)?.[0];

  // Sơ đồ SVG lấy từ seed/admin đi qua sanitize trước khi dangerouslySetInnerHTML để chặn stored XSS.
  const sanitizedSeatMapSvg = useMemo(() => {
    if (!concert?.seatMapSvg) return '';
    return DOMPurify.sanitize(concert.seatMapSvg, { USE_PROFILES: { svg: true, svgFilters: true } });
  }, [concert?.seatMapSvg]);

  // Gắn tương tác (click chọn vé + đổi màu theo trạng thái) lên các khu vực [data-zone]
  // của SVG seed, khớp theo tên ticket type (SVIP/VIP/CAT1/CAT2/GA).
  useEffect(() => {
    const container = seatMapRef.current;
    if (!container || !sanitizedSeatMapSvg) return;

    const zoneEls = container.querySelectorAll<SVGElement>('[data-zone]');
    zoneEls.forEach((el) => {
      const ticket = concert.ticketTypes?.find((t: any) => t.name === el.getAttribute('data-zone'));
      if (!ticket) {
        el.onclick = null;
        (el as unknown as HTMLElement).style.cursor = 'default';
        return;
      }

      const isSaleStarted = new Date() >= new Date(ticket.saleStartsAt);
      const isSoldOut = ticket.remainingQty === 0;
      const qtySelected = quantities[ticket.id] || 0;
      const isSelected = qtySelected > 0;
      const isLocked = (activeTicketTypeId && ticket.id !== activeTicketTypeId) || !isSaleStarted;
      const isDisabled = isSoldOut || isLocked;

      const style = (el as unknown as HTMLElement).style;
      style.cursor = isDisabled ? 'not-allowed' : 'pointer';
      style.filter = isDisabled ? 'grayscale(0.85) opacity(0.55)' : 'none';
      style.stroke = isSelected ? '#111827' : '';
      style.strokeWidth = isSelected ? '5' : '';
      style.transition = 'filter 0.2s ease-in-out, stroke-width 0.2s ease-in-out';

      el.onclick = () => {
        if (!isDisabled && qtySelected < ticket.maxPerUser) {
          handleQuantityChange(ticket.id, 1, ticket.maxPerUser, ticket.remainingQty);
        }
      };
    });
  }, [sanitizedSeatMapSvg, concert?.ticketTypes, quantities, activeTicketTypeId]);

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

    if (items.length > 1) {
      setCheckoutError("Hệ thống hiện tại chỉ hỗ trợ mua 1 loại vé trong một giao dịch. Vui lòng thanh toán riêng từng loại vé!");
      setIsCheckingOut(false);
      return;
    }

    const selectedItem = items[0];
    const idempotencyKey = crypto.randomUUID();

    try {
      const response = await apiClient.post(
        '/orders',
        {
          ticketTypeId: selectedItem.ticketTypeId,
          quantity: selectedItem.quantity
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Idempotency-Key': idempotencyKey
          }
        }
      );

      const orderId = response.data.id;

      if (paymentMethod === 'VNPAY' && vnpayEnabled) {
        const vnpayRes = await apiClient.get(
          `/orders/vnpay/url/${orderId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        window.location.href = vnpayRes.data.url;
      } else {
        window.location.href = `http://localhost:4000/pay?orderId=${orderId}&amount=${totalAmount}&concertSlug=${slug}`;
      }
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 409) setCheckoutError("Rất tiếc! Số lượng vé bạn chọn vừa bị mua hết (Oversell Protection).");
      else if (status === 400) {
        const msg = err.response?.data?.message;
        if (Array.isArray(msg)) {
          setCheckoutError(`Dữ liệu không hợp lệ: ${msg.join(', ')}`);
        } else if (msg) {
          setCheckoutError(msg);
        } else {
          setCheckoutError("Yêu cầu không hợp lệ. Vui lòng kiểm tra lại thông tin giao dịch.");
        }
      }
      else if (status === 503) setCheckoutError("Cổng thanh toán hiện đang quá tải (Circuit Breaker Opened). Vui lòng thử lại sau ít phút!");
      else if (status === 429) setCheckoutError("Bạn đang thao tác quá nhanh. Vui lòng chậm lại (Rate Limit).");
      else setCheckoutError("Đã xảy ra lỗi không xác định. Vui lòng thử lại!");
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (loading) return <div style={{ padding: '50px', textAlign: 'center', fontSize: '1.2rem' }}>⏳ Đang tải dữ liệu thực tế...</div>;
  if (!concert) return <div style={{ padding: '50px', textAlign: 'center', color: 'red' }}>Không tìm thấy Concert!</div>;

  // Hiển thị banner hủy concert trước khi render nội dung mua vé
  if (concert.status === 'CANCELLED') {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px' }}>
        <Link to="/" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 'bold' }}>← Quay lại danh sách</Link>
        <div style={{
          marginTop: '30px',
          background: '#fef2f2',
          border: '2px solid #ef4444',
          borderRadius: '12px',
          padding: '40px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🚫</div>
          <h1 style={{ fontSize: '2rem', color: '#b91c1c', marginBottom: '12px' }}>Sự kiện đã bị hủy</h1>
          <h2 style={{ fontSize: '1.3rem', color: '#374151', marginBottom: '12px' }}>{concert.title}</h2>
          <p style={{ color: '#6b7280', fontSize: '1rem', marginBottom: '8px' }}>
            📍 {concert.venue} &nbsp;|&nbsp; ⏰ {new Date(concert.startsAt).toLocaleString('vi-VN')}
          </p>
          <p style={{ color: '#dc2626', fontWeight: 600, marginTop: '20px', fontSize: '1rem' }}>
            Sự kiện này đã bị hủy bởi Ban tổ chức. Vé của bạn (nếu đã mua) sẽ được hoàn tiền trong thời gian sớm nhất.
          </p>
          <p style={{ color: '#6b7280', marginTop: '12px', fontSize: '0.9rem' }}>
            Vui lòng kiểm tra hộp thư <Link to="/notifications" style={{ color: '#2563eb' }}>Thông báo</Link> để biết thêm chi tiết.
          </p>
        </div>
      </div>
    );
  }

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
        <h1 style={{ fontSize: '2.5rem', marginBottom: '10px', color: '#000000ff' }}>{concert.title}</h1>
        <p style={{ fontSize: '1.1rem', color: '#4b5563', marginBottom: '20px', paddingTop: '30px' }}>📍 {concert.venue} &nbsp;|&nbsp; ⏰ {new Date(concert.startsAt).toLocaleString('vi-VN')}</p>

        {Array.isArray(concert.artists) && concert.artists.length > 0 && (
          <p style={{ fontSize: '1.05rem', color: '#111827', fontWeight: 600, marginBottom: '20px' }}>
            🎤 {concert.artists.join(', ')}
          </p>
        )}

        {/* ===== AI Artist Bio ===== */}
        {concert.artistBio && (
          <div style={{
            background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
            border: '1px solid #c4b5fd',
            borderLeft: '4px solid #7c3aed',
            borderRadius: '12px',
            padding: '20px 24px',
            marginBottom: '28px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span style={{ fontSize: '1.2rem' }}>🤖</span>
              <span style={{
                fontWeight: 700, color: '#7c3aed', fontSize: '0.85rem',
                textTransform: 'uppercase', letterSpacing: '0.5px'
              }}>
                AI Artist Bio
              </span>
            </div>
            <p style={{
              color: '#3730a3', lineHeight: 1.8, margin: 0,
              fontSize: '0.97rem', whiteSpace: 'pre-wrap'
            }}>
              {concert.artistBio}
            </p>
          </div>
        )}

        {checkoutError && (
          <div style={{ background: '#fee2e2', borderLeft: '4px solid #ef4444', color: '#b91c1c', padding: '15px', marginBottom: '25px', borderRadius: '4px' }}>
            <strong>Lỗi thanh toán:</strong> {checkoutError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>

          {/* Cột trái: 2. BẢN ĐỒ SVG TƯƠNG TÁC */}
          <div style={{ flex: '1 1 500px', background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '20px', color: '#334155', textAlign: 'center' }}>Sơ đồ & Tình trạng ghế</h3>

            {sanitizedSeatMapSvg ? (
              <div
                ref={seatMapRef}
                style={{ width: '100%', minHeight: '400px' }}
                dangerouslySetInnerHTML={{ __html: sanitizedSeatMapSvg }}
              />
            ) : (
              <svg viewBox="0 0 800 600" style={{ width: '100%', height: '100%', minHeight: '400px', userSelect: 'none' }}>
                {/* Vẽ Sân Khấu (Stage) */}
                <rect x="250" y="20" width="300" height="80" rx="15" fill="#1e293b" />
                <text x="400" y="65" fill="white" fontSize="26" fontWeight="bold" textAnchor="middle" letterSpacing="2">SÂN KHẤU</text>

                {/* Render linh hoạt các khu vực ghế ngồi dựa trên dữ liệu thật của API */}
                {concert.ticketTypes?.map((ticket: any, index: number) => {
                  const isSaleStarted = new Date() >= new Date(ticket.saleStartsAt);
                  const isSoldOut = ticket.remainingQty === 0;
                  const qtySelected = quantities[ticket.id] || 0;
                  const isSelected = qtySelected > 0;
                  const isLocked = (activeTicketTypeId && ticket.id !== activeTicketTypeId) || !isSaleStarted;

                  // Toán học để tự động xếp các khu vực thành 2 cột (Trái/Phải) và dồn dần về phía sau
                  const row = Math.floor(index / 2);
                  const col = index % 2;
                  const width = 300;
                  const height = 110;
                  const x = col === 0 ? 80 : 420;
                  const y = 140 + (row * 140);

                  // Logic Màu sắc: Xám (Hết vé hoặc bị khóa), Xanh đậm (Đang chọn), Xanh nhạt (Còn trống)
                  let fillColor = '#bae6fd';
                  let textColor = '#0369a1';
                  let strokeColor = '#7dd3fc';

                  if (isSoldOut || isLocked) {
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
                        if (!isSoldOut && !isLocked && qtySelected < ticket.maxPerUser) {
                          // Tăng số lượng vé lên 1 khi click vào bản đồ
                          handleQuantityChange(ticket.id, 1, ticket.maxPerUser, ticket.remainingQty);
                        }
                      }}
                      style={{ cursor: (isSoldOut || isLocked) ? 'not-allowed' : 'pointer', transition: 'all 0.2s ease-in-out', opacity: isLocked ? 0.5 : 1 }}
                    >
                      <rect x={x} y={y} width={width} height={height} rx="12" fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 4 : 2} />
                      <text x={x + width / 2} y={y + 45} fill={textColor} fontSize="22" fontWeight="bold" textAnchor="middle">{ticket.name}</text>
                      <text x={x + width / 2} y={y + 75} fill={isSelected ? '#bfdbfe' : textColor} fontSize="16" textAnchor="middle">
                        {isSoldOut ? 'HẾT VÉ' : (!isSaleStarted ? 'CHƯA BÁN' : `Còn trống: ${ticket.remainingQty}`)}
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
            )}
            <p style={{ textAlign: 'center', fontSize: '0.9rem', color: '#64748b', marginTop: '15px' }}>
              * Bấm trực tiếp vào khu vực trên bản đồ để chọn vé nhanh
            </p>
          </div>

          {/* Cột phải: Danh sách vé & Mua hàng */}
          <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Giỏ hàng của bạn</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', flexGrow: 1 }}>
              {concert.ticketTypes?.map((ticket: any) => {
                const isSaleStarted = new Date() >= new Date(ticket.saleStartsAt);
                const qty = quantities[ticket.id] || 0;
                const isSoldOut = ticket.remainingQty === 0;
                const isLocked = (activeTicketTypeId && ticket.id !== activeTicketTypeId) || !isSaleStarted;

                return (
                  <div key={ticket.id} style={{
                    padding: '15px',
                    border: qty > 0 ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                    borderRadius: '10px',
                    background: (isSoldOut || isLocked) ? '#f9fafb' : 'white',
                    opacity: isLocked ? 0.5 : 1,
                    transition: 'all 0.2s'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: (isSoldOut || isLocked) ? '#9ca3af' : '#111827' }}>{ticket.name}</div>
                        <div style={{ color: (isSoldOut || isLocked) ? '#9ca3af' : '#ef4444', fontWeight: 'bold', marginTop: '5px' }}>
                          {ticket.price.toLocaleString('vi-VN')} VNĐ
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '0.85rem', color: '#6b7280' }}>
                        <div>Còn lại: <strong style={{ color: isSoldOut ? '#ef4444' : (isLocked ? '#9ca3af' : '#059669') }}>{ticket.remainingQty}</strong></div>
                        <div>Giới hạn: <strong>{ticket.maxPerUser}/người</strong></div>
                      </div>
                    </div>

                    {!isSoldOut && isSaleStarted && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '15px', borderTop: '1px dashed #e5e7eb', paddingTop: '15px' }}>
                        <button
                          onClick={() => handleQuantityChange(ticket.id, -1, ticket.maxPerUser, ticket.remainingQty)}
                          disabled={qty === 0 || isLocked}
                          style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #d1d5db', background: (qty === 0 || isLocked) ? '#f3f4f6' : 'white', cursor: (qty === 0 || isLocked) ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
                        <span style={{ fontWeight: 'bold', fontSize: '1.2rem', width: '30px', textAlign: 'center', color: isLocked ? '#9ca3af' : '#111827' }}>{qty}</span>
                        <button
                          onClick={() => handleQuantityChange(ticket.id, 1, ticket.maxPerUser, ticket.remainingQty)}
                          disabled={qty >= ticket.maxPerUser || qty >= ticket.remainingQty || isLocked}
                          style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #d1d5db', background: (qty >= ticket.maxPerUser || qty >= ticket.remainingQty || isLocked) ? '#f3f4f6' : 'white', cursor: (qty >= ticket.maxPerUser || qty >= ticket.remainingQty || isLocked) ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      </div>
                    )}
                    {!isSoldOut && !isSaleStarted && (
                      <div style={{ marginTop: '10px', color: '#d97706', fontWeight: 'bold', textAlign: 'center', padding: '10px 0', background: '#fef3c7', borderRadius: '6px', fontSize: '0.9rem' }}>
                        CHƯA MỞ BÁN (Mở lúc: {new Date(ticket.saleStartsAt).toLocaleString('vi-VN')})
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

              <div style={{ marginBottom: '20px' }}>
                <p style={{ marginBottom: '10px', fontSize: '0.9rem', color: '#94a3b8' }}>Phương thức thanh toán:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {vnpayEnabled && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="VNPAY"
                        checked={paymentMethod === 'VNPAY'}
                        onChange={() => setPaymentMethod('VNPAY')}
                      />
                      <span style={{ color: paymentMethod === 'VNPAY' ? 'white' : '#94a3b8' }}>Thẻ nội địa - VNPay Sandbox</span>
                    </label>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="MOCK"
                      checked={paymentMethod === 'MOCK'}
                      onChange={() => setPaymentMethod('MOCK')}
                    />
                    <span style={{ color: paymentMethod === 'MOCK' ? 'white' : '#94a3b8' }}>Mock Gateway (mặc định)</span>
                  </label>
                </div>
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
