import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import ScannerTab from './components/ScannerTab';
import VIPTab from './components/VIPTab';
import LoginView from './components/LoginView';
import ConcertSelectView from './components/ConcertSelectView';
import { startSyncEngine } from './services/syncEngine';
import { downloadSnapshot } from './services/preload';
import {
  clearSession,
  getSelectedConcert,
  getSession,
  type SelectedConcert,
} from './services/session';
import { db } from './db/db';
import { Wifi, WifiOff, DownloadCloud, LogOut, Repeat } from 'lucide-react';
import './App.css'; // Just basic reset

type View = 'LOGIN' | 'SELECT_CONCERT' | 'SCAN';

export default function App() {
  // Đọc phiên đồng bộ từ localStorage khi khởi động → reload offline vào thẳng màn quét.
  const [session, setSession] = useState<{ email: string; role: string } | null>(() => getSession());
  const [concert, setConcert] = useState<SelectedConcert | null>(() => getSelectedConcert());
  const [view, setView] = useState<View>(() =>
    !getSession() ? 'LOGIN' : !getSelectedConcert() ? 'SELECT_CONCERT' : 'SCAN',
  );

  const [activeTab, setActiveTab] = useState<'SCANNER' | 'VIP'>('SCANNER');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const snapshot = useLiveQuery(
    () => concert ? db.meta.get(`snapshot:${concert.id}`) : undefined,
    [concert?.id],
  );

  useEffect(() => {
    // Token hết hạn/không hợp lệ (interceptor 401) → quay về đăng nhập.
    // Hàng đợi offline trong Dexie được giữ nguyên, sync tiếp sau khi đăng nhập lại.
    const handleAuthExpired = () => {
      setSession(null);
      setView('LOGIN');
    };
    window.addEventListener('auth-expired', handleAuthExpired);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('auth-expired', handleAuthExpired);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (view !== 'SCAN') return;
    // startSyncEngine trả về cleanup → StrictMode remount không tạo interval trùng.
    return startSyncEngine();
  }, [view]);

  const handleLogout = () => {
    clearSession(); // chỉ xóa token — concert đã chọn và deviceId giữ nguyên
    setSession(null);
    setView('LOGIN');
  };

  const handlePreDownload = async () => {
    if (!isOnline || !concert) return;

    setIsDownloading(true);
    setDownloadError('');
    try {
      const info = await downloadSnapshot(concert);
      alert(`Đã tải ${info.ticketCount} vé và ${info.guestCount} khách mời cho "${concert.title}". Có thể soát vé offline.`);
    } catch (err) {
      console.error(err);
      setDownloadError('Lỗi tải dữ liệu. Kiểm tra mạng rồi thử lại.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (view === 'LOGIN') {
    return (
      <LoginView
        onLoggedIn={(s) => {
          setSession(s);
          setView(getSelectedConcert() ? 'SCAN' : 'SELECT_CONCERT');
        }}
      />
    );
  }

  if (view === 'SELECT_CONCERT') {
    return (
      <ConcertSelectView
        accountEmail={session?.email ?? ''}
        onLogout={handleLogout}
        onSelected={(c) => {
          setConcert(c);
          setView('SCAN');
        }}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ background: 'white', padding: '12px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: '1.1rem', color: '#111827', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              🎫 {concert?.title ?? 'TB Scanner'}
            </h1>
            <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>{session?.email}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: isOnline ? '#16a34a' : '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>
              {isOnline ? <><Wifi size={18} /> Online</> : <><WifiOff size={18} /> Offline</>}
            </div>
            <button
              onClick={handleLogout}
              title="Đăng xuất"
              style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handlePreDownload}
              disabled={!isOnline || isDownloading}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: (!isOnline || isDownloading) ? '#9ca3af' : '#2563eb', fontWeight: 600, cursor: (!isOnline || isDownloading) ? 'not-allowed' : 'pointer', padding: 0 }}
            >
              <DownloadCloud size={18} />
              {isDownloading ? 'Đang tải...' : 'Tải dữ liệu'}
            </button>

            <button
              onClick={() => setView('SELECT_CONCERT')}
              disabled={!isOnline}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: !isOnline ? '#9ca3af' : '#2563eb', fontWeight: 600, cursor: !isOnline ? 'not-allowed' : 'pointer', padding: 0 }}
            >
              <Repeat size={16} /> Đổi sự kiện
            </button>
          </div>

          <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
            {snapshot?.concertId === concert?.id && snapshot?.downloadedAt
              ? `Snapshot: ${snapshot.ticketCount} vé, ${snapshot.guestCount} khách · ${new Date(snapshot.downloadedAt).toLocaleString('vi-VN')}`
              : 'Chưa tải dữ liệu cho sự kiện này'}
          </span>
        </div>

        {downloadError && (
          <p style={{ margin: '8px 0 0 0', color: '#dc2626', fontSize: '0.85rem' }}>{downloadError}</p>
        )}
      </header>

      {/* Main Content */}
      <main style={{ paddingBottom: '70px' }}>
        {activeTab === 'SCANNER'
          ? <ScannerTab concertId={concert!.id} />
          : <VIPTab concertId={concert!.id} />}
      </main>

      {/* Bottom Navigation */}
      <nav style={{ position: 'fixed', bottom: 0, width: '100%', background: 'white', display: 'flex', borderTop: '1px solid #e5e7eb', zIndex: 10 }}>
        <button
          onClick={() => setActiveTab('SCANNER')}
          style={{ flex: 1, padding: '15px', border: 'none', background: 'none', color: activeTab === 'SCANNER' ? '#2563eb' : '#6b7280', fontWeight: activeTab === 'SCANNER' ? 700 : 500, fontSize: '1rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}
        >
          📷 Soát vé
        </button>
        <button
          onClick={() => setActiveTab('VIP')}
          style={{ flex: 1, padding: '15px', border: 'none', background: 'none', color: activeTab === 'VIP' ? '#2563eb' : '#6b7280', fontWeight: activeTab === 'VIP' ? 700 : 500, fontSize: '1rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}
        >
          👑 Danh sách VIP
        </button>
      </nav>
    </div>
  );
}
