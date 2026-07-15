import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Sparkles, AlertTriangle } from 'lucide-react';
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

  if (loading) return (
    <div className="empty-state">
      <div className="spinner" style={{ margin: '0 auto 12px' }} />
      Đang tải dữ liệu...
    </div>
  );
  if (!concert) return <div className="alert alert-danger">Không tìm thấy Concert!</div>;

  // Hiển thị banner hủy concert trước khi render nội dung mua vé
  if (concert.status === 'CANCELLED') {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 600 }}>
          <ChevronLeft size={16} /> Quay lại danh sách
        </Link>
        <div className="card" style={{ marginTop: 24, padding: 40, textAlign: 'center', borderColor: 'var(--danger-border)' }}>
          <AlertTriangle size={48} style={{ color: 'var(--danger)', margin: '0 auto 16px' }} />
          <h1 style={{ fontSize: 26, color: 'var(--danger)', marginBottom: 12 }}>Sự kiện đã bị hủy</h1>
          <h2 style={{ fontSize: 19, marginBottom: 12 }}>{concert.title}</h2>
          <p style={{ color: 'var(--text-2)', marginBottom: 8 }}>
            {concert.venue} &nbsp;|&nbsp; {new Date(concert.startsAt).toLocaleString('vi-VN')}
          </p>
          <p style={{ color: 'var(--danger)', fontWeight: 600, marginTop: 20 }}>
            Sự kiện này đã bị hủy bởi Ban tổ chức. Vé của bạn (nếu đã mua) sẽ được hoàn tiền trong thời gian sớm nhất.
          </p>
          <p style={{ color: 'var(--text-2)', marginTop: 12, fontSize: 14 }}>
            Vui lòng kiểm tra hộp thư <Link to="/notifications">Thông báo</Link> để biết thêm chi tiết.
          </p>
        </div>
      </div>
    );
  }

  if (issuedTickets.length > 0) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 26, marginBottom: 10 }}>Thanh toán thành công!</h1>
        <p style={{ color: 'var(--text-2)', marginBottom: 24 }}>Vui lòng xuất trình mã QR dưới đây tại cổng sự kiện.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'center' }}>
          {issuedTickets.map((ticket) => (
            <div key={ticket.id} className="card" style={{ padding: 20 }}>
              <QRCodeSVG value={ticket.qrCode} size={180} />
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>{ticket.qrCode}</div>
            </div>
          ))}
        </div>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 24 }}>Về trang chủ</Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 600 }}>
        <ChevronLeft size={16} /> Quay lại danh sách
      </Link>

      <div className="card" style={{ marginTop: 20, padding: 30 }}>
        <h1 style={{ fontSize: 30, marginBottom: 10 }}>{concert.title}</h1>
        <p style={{ fontSize: 16, color: 'var(--text-2)', marginBottom: 20 }}>{concert.venue} &nbsp;|&nbsp; {new Date(concert.startsAt).toLocaleString('vi-VN')}</p>

        {Array.isArray(concert.artists) && concert.artists.length > 0 && (
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
            {concert.artists.join(', ')}
          </p>
        )}

        {/* ===== AI Artist Bio ===== */}
        {concert.artistBio && (
          <div className="card" style={{ background: 'var(--primary-soft)', borderLeft: '4px solid var(--accent)', padding: '20px 24px', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Sparkles size={16} color="var(--accent)" />
              <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                AI Artist Bio
              </span>
            </div>
            <p style={{ lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{concert.artistBio}</p>
          </div>
        )}

        {checkoutError && (
          <div className="alert alert-danger" style={{ marginBottom: 25 }}>
            <strong>Lỗi thanh toán:</strong> {checkoutError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>

          {/* Cột trái: Bản đồ SVG tương tác */}
          <div className="seat-map" style={{ flex: '1 1 500px', background: 'var(--surface-2)', padding: 20, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: 18, marginBottom: 20, textAlign: 'center' }}>Sơ đồ & Tình trạng ghế</h3>

            {sanitizedSeatMapSvg ? (
              <div
                ref={seatMapRef}
                style={{ width: '100%', minHeight: 400 }}
                dangerouslySetInnerHTML={{ __html: sanitizedSeatMapSvg }}
              />
            ) : (
              <svg viewBox="0 0 800 600" style={{ width: '100%', height: '100%', minHeight: 400, userSelect: 'none' }}>
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
            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-3)', marginTop: 15 }}>
              * Bấm trực tiếp vào khu vực trên bản đồ để chọn vé nhanh
            </p>
          </div>

          {/* Cột phải: Danh sách vé & Mua hàng */}
          <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: 20, marginBottom: 20 }}>Giỏ hàng của bạn</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 15, flexGrow: 1 }}>
              {concert.ticketTypes?.map((ticket: any) => {
                const isSaleStarted = new Date() >= new Date(ticket.saleStartsAt);
                const qty = quantities[ticket.id] || 0;
                const isSoldOut = ticket.remainingQty === 0;
                const isLocked = (activeTicketTypeId && ticket.id !== activeTicketTypeId) || !isSaleStarted;

                return (
                  <div key={ticket.id} className="card" style={{
                    padding: 15,
                    borderWidth: qty > 0 ? 2 : 1,
                    borderColor: qty > 0 ? 'var(--primary)' : 'var(--border)',
                    background: (isSoldOut || isLocked) ? 'var(--surface-2)' : 'var(--surface)',
                    opacity: isLocked ? 0.5 : 1,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 19, color: (isSoldOut || isLocked) ? 'var(--text-3)' : 'var(--text)' }}>{ticket.name}</div>
                        <div style={{ color: (isSoldOut || isLocked) ? 'var(--text-3)' : 'var(--danger)', fontWeight: 700, marginTop: 5 }}>
                          {ticket.price.toLocaleString('vi-VN')} VNĐ
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-2)' }}>
                        <div>Còn lại: <strong style={{ color: isSoldOut ? 'var(--danger)' : (isLocked ? 'var(--text-3)' : 'var(--success)') }}>{ticket.remainingQty}</strong></div>
                        <div>Giới hạn: <strong>{ticket.maxPerUser}/người</strong></div>
                      </div>
                    </div>

                    {!isSoldOut && isSaleStarted && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginTop: 15, borderTop: '1px dashed var(--border)', paddingTop: 15 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleQuantityChange(ticket.id, -1, ticket.maxPerUser, ticket.remainingQty)}
                          disabled={qty === 0 || isLocked}
                          style={{ width: 36, height: 36, borderRadius: '50%', padding: 0 }}>-</button>
                        <span style={{ fontWeight: 700, fontSize: 19, width: 30, textAlign: 'center', color: isLocked ? 'var(--text-3)' : 'var(--text)' }}>{qty}</span>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleQuantityChange(ticket.id, 1, ticket.maxPerUser, ticket.remainingQty)}
                          disabled={qty >= ticket.maxPerUser || qty >= ticket.remainingQty || isLocked}
                          style={{ width: 36, height: 36, borderRadius: '50%', padding: 0 }}>+</button>
                      </div>
                    )}
                    {!isSoldOut && !isSaleStarted && (
                      <div className="alert alert-warning" style={{ marginTop: 10, textAlign: 'center' }}>
                        CHƯA MỞ BÁN (Mở lúc: {new Date(ticket.saleStartsAt).toLocaleString('vi-VN')})
                      </div>
                    )}
                    {isSoldOut && <div className="alert alert-danger" style={{ marginTop: 10, textAlign: 'center' }}>ĐÃ BÁN HẾT</div>}
                  </div>
                );
              })}
            </div>

            {/* Thanh toán Box */}
            <div style={{ marginTop: 25, padding: 25, background: '#0f172a', borderRadius: 'var(--radius-lg)', color: 'white', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15, fontSize: 17, color: '#94a3b8' }}>
                <span>Tổng số lượng vé:</span>
                <span style={{ fontWeight: 700, color: 'white' }}>{totalTickets} vé</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 25, fontSize: 22 }}>
                <span>Tổng tiền:</span>
                <span style={{ fontWeight: 700, color: '#38bdf8' }}>{totalAmount.toLocaleString('vi-VN')} VNĐ</span>
              </div>

              <div style={{ marginBottom: 20 }}>
                <p style={{ marginBottom: 10, fontSize: 14, color: '#94a3b8' }}>Phương thức thanh toán:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {vnpayEnabled && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
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
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
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
                className="btn btn-primary"
                onClick={handleCheckout}
                disabled={totalTickets === 0 || isCheckingOut}
                style={{ width: '100%', padding: 16, fontSize: 17 }}>
                {isCheckingOut ? 'Đang kết nối cổng thanh toán...' : 'THANH TOÁN NGAY'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
