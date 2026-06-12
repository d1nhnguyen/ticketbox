import { useParams, Link } from 'react-router-dom';
import { mockConcerts } from '../data/mockConcerts';

export default function ConcertDetail() {
  const { slug } = useParams<{ slug: string }>();
  
  const concert = mockConcerts.find(c => c.slug === slug);

  if (!concert) return <div style={{ padding: '20px' }}>Không tìm thấy Concert!</div>;

  return (
    <div style={{ padding: '20px' }}>
      <Link to="/">← Quay lại danh sách</Link>
      
      <h1 style={{ marginTop: '20px' }}>{concert.title}</h1>
      <p>📍 {concert.venue} | ⏰ {new Date(concert.startsAt).toLocaleString('vi-VN')}</p>

      <div style={{ display: 'flex', gap: '20px', marginTop: '30px' }}>
        {/* Cột trái: Nơi để Sơ đồ ghế ngồi SVG */}
        <div style={{ flex: 1, backgroundColor: '#f3f4f6', height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1' }}>
          <p style={{ color: '#64748b' }}>[Placeholder] Interactive SVG Seat Map sẽ thêm vào Week 2</p>
        </div>

        {/* Cột phải: Danh sách vé */}
        <div style={{ flex: 1 }}>
          <h3>Các loại vé</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {concert.ticketTypes.map(ticket => (
              <li key={ticket.id} style={{ borderBottom: '1px solid #eee', padding: '10px 0', display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <strong>{ticket.name}</strong>
                  <div style={{ color: '#ef4444', fontWeight: 'bold' }}>{ticket.price.toLocaleString('vi-VN')} VNĐ</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div>Còn lại: <span style={{ fontWeight: 'bold' }}>{ticket.remainingQty}</span></div>
                  <button disabled={ticket.remainingQty === 0} style={{ padding: '5px 10px', marginTop: '5px', cursor: ticket.remainingQty === 0 ? 'not-allowed' : 'pointer' }}>
                    {ticket.remainingQty === 0 ? 'Hết vé' : 'Chọn mua'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}