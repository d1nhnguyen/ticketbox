import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, MapPin, RefreshCw, LogOut, Ticket } from 'lucide-react';
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
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!mountedRef.current) return;

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const data = await fetchConcerts();
      if (mountedRef.current && requestId === requestIdRef.current) {
        setConcerts(data);
      }
    } catch {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setError('Không tải được danh sách sự kiện. Kiểm tra mạng và thử lại.');
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Schedule the initial request outside the effect body; load() is also the
    // single implementation used by the retry button.
    const initialLoad = window.setTimeout(() => void load(), 0);

    return () => {
      window.clearTimeout(initialLoad);
      mountedRef.current = false;
      // Invalidate every in-flight request so a late response cannot commit.
      requestIdRef.current += 1;
    };
  }, [load]);

  const handlePick = (c: ConcertSummary) => {
    const concert: SelectedConcert = { id: c.id, title: c.title };
    setSelectedConcert(concert);
    onSelected(concert);
  };

  return (
    <div className="scan-shell">
      <header className="scan-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ticket size={18} color="var(--primary)" />
          <h1 style={{ fontSize: 17 }}>Chọn sự kiện</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{accountEmail}</span>
          <button className="btn btn-ghost" onClick={onLogout} style={{ padding: 6, color: 'var(--danger)' }}>
            <LogOut size={18} /> Đăng xuất
          </button>
        </div>
      </header>

      <main style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div className="spinner" style={{ margin: '0 auto 10px' }} />
            <p style={{ color: 'var(--text-2)' }}>Đang tải danh sách sự kiện...</p>
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</p>
            <button className="btn btn-primary" onClick={() => void load()}>
              <RefreshCw size={16} /> Thử lại
            </button>
          </div>
        )}

        {!loading && !error && concerts.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--text-2)' }}>Chưa có sự kiện nào.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {concerts.map((c) => (
            <button
              key={c.id}
              onClick={() => handlePick(c)}
              className="card"
              style={{ textAlign: 'left', padding: 16, cursor: 'pointer', border: '2px solid var(--border)' }}
            >
              <h3 style={{ fontSize: 17, marginBottom: 8 }}>{c.title}</h3>
              <p style={{ margin: '0 0 4px 0', color: 'var(--text-2)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} /> {c.venue}
              </p>
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CalendarDays size={14} /> {new Date(c.startsAt).toLocaleString('vi-VN')}
              </p>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
