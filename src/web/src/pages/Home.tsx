import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, CalendarDays } from 'lucide-react';
import apiClient from '../api/client';

export default function Home() {
  const [concerts, setConcerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get('/concerts')
      .then(res => setConcerts(res.data))
      .catch(err => {
        console.error("Lỗi fetch concerts:", err);
        setError('Không thể kết nối đến Backend. Vui lòng đảm bảo docker-compose up đang chạy!');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Concert đang mở bán</div>
          <div className="page-subtitle">Chọn sự kiện yêu thích và đặt vé ngay hôm nay</div>
        </div>
      </div>

      {loading && (
        <div className="empty-state">
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          Đang tải dữ liệu...
        </div>
      )}
      {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>{error}</div>}

      {!loading && !error && (
        <div className="grid-cards">
          {concerts.map((c: any) => (
            <div key={c.id} className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {c.imageUrl ? (
                <img src={c.imageUrl} alt={c.title} style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ height: 160, background: 'var(--brand-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700 }}>
                  {c.title}
                </div>
              )}
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', flex: 1 }}>
                <h3 style={{ fontSize: 17, marginBottom: 10 }}>{c.title}</h3>
                <p style={{ color: 'var(--text-2)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <MapPin size={14} /> {c.venue}
                </p>
                <p style={{ color: 'var(--text-2)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
                  <CalendarDays size={14} /> {new Date(c.startsAt).toLocaleString('vi-VN')}
                </p>
                <Link to={`/concert/${c.slug}`} className="btn btn-primary" style={{ marginTop: 'auto' }}>
                  Xem chi tiết
                </Link>
              </div>
            </div>
          ))}
          {concerts.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>Chưa có concert nào trong Database.</div>
          )}
        </div>
      )}
    </div>
  );
}
