import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, MapPin, RefreshCw, LogOut } from 'lucide-react';
import { fetchConcerts, type ConcertSummary } from '../services/api';
import { setSelectedConcert, type SelectedConcert } from '../services/session';

interface Props {
  accountEmail: string;
  onSelected: (concert: SelectedConcert) => void;
  onLogout: () => void;
}

export default function ConcertSelectView({ accountEmail, onSelected, onLogout }: Props) {
  const [concerts, setConcerts] = useState<ConcertSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setConcerts(await fetchConcerts());
    } catch {
      setError('Không tải được danh sách sự kiện. Kiểm tra mạng và thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetchConcerts()
      .then((data) => {
        if (!cancelled) setConcerts(data);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Không tải được danh sách sự kiện. Kiểm tra mạng và thử lại.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handlePick = (c: ConcertSummary) => {
    const concert: SelectedConcert = { id: c.id, title: c.title };
    setSelectedConcert(concert);
    onSelected(concert);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ background: 'white', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h1 style={{ margin: 0, fontSize: '1.2rem', color: '#111827', fontWeight: 800 }}>🎫 Chọn sự kiện</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{accountEmail}</span>
          <button
            onClick={onLogout}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: '#ef4444', fontWeight: 600, cursor: 'pointer' }}
          >
            <LogOut size={18} /> Đăng xuất
          </button>
        </div>
      </header>

      <main style={{ padding: '20px', maxWidth: '500px', margin: '0 auto' }}>
        {loading && <p style={{ textAlign: 'center', color: '#6b7280' }}>Đang tải danh sách sự kiện...</p>}

        {error && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#dc2626' }}>{error}</p>
            <button
              onClick={() => void load()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 18px', borderRadius: '8px', border: 'none', background: '#2563eb', color: 'white', fontWeight: 600, cursor: 'pointer' }}
            >
              <RefreshCw size={16} /> Thử lại
            </button>
          </div>
        )}

        {!loading && !error && concerts.length === 0 && (
          <p style={{ textAlign: 'center', color: '#6b7280' }}>Chưa có sự kiện nào.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {concerts.map((c) => (
            <button
              key={c.id}
              onClick={() => handlePick(c)}
              style={{
                textAlign: 'left', background: 'white', border: '2px solid #e5e7eb', borderRadius: '12px',
                padding: '16px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              }}
            >
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: '#111827' }}>{c.title}</h3>
              <p style={{ margin: '0 0 4px 0', color: '#6b7280', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={14} /> {c.venue}
              </p>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CalendarDays size={14} /> {new Date(c.startsAt).toLocaleString('vi-VN')}
              </p>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
