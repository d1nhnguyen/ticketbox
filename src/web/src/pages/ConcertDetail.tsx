import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

export default function ConcertDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [concert, setConcert] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`http://localhost:3000/concerts/${slug}`)
      .then(res => setConcert(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div style={{ padding: '50px', textAlign: 'center' }}>Đang tải...</div>;
  if (!concert) return <div style={{ padding: '50px', textAlign: 'center', color: 'red' }}>Không tìm thấy Concert!</div>;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '30px 20px' }}>
      <Link to="/" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 'bold' }}>← Quay lại danh sách</Link>
      <div style={{ marginTop: '30px', background: 'white', padding: '30px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '15px' }}>{concert.title}</h1>
        <p style={{ fontSize: '1.1rem', color: '#4b5563', marginBottom: '30px' }}>📍 {concert.venue} &nbsp;|&nbsp; ⏰ {new Date(concert.startsAt).toLocaleString('vi-VN')}</p>
        <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 400px', background: '#f9fafb', minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1', borderRadius: '12px' }}>
            <p style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#64748b' }}>Khu vực Sơ đồ ghế ngồi</p>
            <p style={{ color: '#94a3b8', marginTop: '10px' }}>Interactive SVG Map sẽ được thêm vào Week 2</p>
          </div>
          <div style={{ flex: '1 1 300px' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Các loại vé</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {concert.ticketTypes?.map((ticket: any) => (
                <div key={ticket.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{ticket.name}</div>
                    <div style={{ color: '#ef4444', fontWeight: 'bold', marginTop: '5px' }}>{ticket.price.toLocaleString('vi-VN')} VNĐ</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ marginBottom: '10px', fontSize: '0.9rem' }}>Còn lại: <strong>{ticket.remainingQty}</strong></div>
                    <button disabled={ticket.remainingQty === 0} style={{ background: ticket.remainingQty === 0 ? '#e5e7eb' : '#2563eb', color: ticket.remainingQty === 0 ? '#9ca3af' : 'white', border: 'none', padding: '8px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: ticket.remainingQty === 0 ? 'not-allowed' : 'pointer' }}>
                      {ticket.remainingQty === 0 ? 'Đã bán hết' : 'Mua ngay'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}