import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '30px 20px' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '30px', color: '#1f2937' }}>Concert đang mở bán</h1>
      {loading && <p>Đang tải dữ liệu từ API...</p>}
      {error && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>{error}</div>}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '25px' }}>
          {concerts.map((c: any) => (
            <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ height: '150px', background: 'linear-gradient(to right, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>Image Placeholder</div>
              <div style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '10px', color: '#111827' }}>{c.title}</h3>
                <p style={{ color: '#4b5563', marginBottom: '5px', fontSize: '0.9rem' }}>{c.venue}</p>
                <p style={{ color: '#4b5563', marginBottom: '20px', fontSize: '0.9rem' }}>{new Date(c.startsAt).toLocaleString('vi-VN')}</p>
                <Link to={`/concert/${c.slug}`} style={{ display: 'block', textAlign: 'center', background: '#111827', color: 'white', padding: '10px 0', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold' }}>Xem chi tiết</Link>
              </div>
            </div>
          ))}
          {concerts.length === 0 && <p>Chưa có concert nào trong Database.</p>}
        </div>
      )}
    </div>
  );
}
