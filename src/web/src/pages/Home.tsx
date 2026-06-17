import { Link } from 'react-router-dom';
import { mockConcerts } from '../data/mockConcerts';

export default function Home() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Trang chủ TicketBox</h1>
      <p>Danh sách Concert đang mở bán:</p>
      
      <div style={{ display: 'grid', gap: '15px', marginTop: '20px' }}>
        {mockConcerts.map((concert) => (
          <div key={concert.id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px' }}>
            <h2>{concert.title}</h2>
            <p>📍 {concert.venue}</p>
            <p>⏰ {new Date(concert.startsAt).toLocaleString('vi-VN')}</p>
            <Link 
              to={`/concert/${concert.slug}`} 
              style={{ display: 'inline-block', marginTop: '10px', padding: '8px 16px', background: '#2563eb', color: 'white', textDecoration: 'none', borderRadius: '4px' }}
            >
              Xem chi tiết & Mua vé
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}