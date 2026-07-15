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
import { Wifi, WifiOff, DownloadCloud, LogOut, Repeat, ScanLine, Users } from 'lucide-react';

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
    <div className="scan-shell">
      {/* Header */}
      <header className="scan-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {concert?.title ?? 'TB Scanner'}
            </h1>
            <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{session?.email}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <span className={isOnline ? 'badge badge-success' : 'badge badge-danger'}>
              {isOnline ? <><Wifi size={14} /> Online</> : <><WifiOff size={14} /> Offline</>}
            </span>
            <button className="btn btn-ghost" onClick={handleLogout} title="Đăng xuất" style={{ padding: 6 }}>
              <LogOut size={18} color="var(--danger)" />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              className="btn btn-ghost"
              onClick={handlePreDownload}
              disabled={!isOnline || isDownloading}
              style={{ padding: 0, color: (!isOnline || isDownloading) ? 'var(--text-3)' : 'var(--primary)' }}
            >
              <DownloadCloud size={16} />
              {isDownloading ? 'Đang tải...' : 'Tải dữ liệu'}
            </button>

            <button
              className="btn btn-ghost"
              onClick={() => setView('SELECT_CONCERT')}
              disabled={!isOnline}
              style={{ padding: 0, color: !isOnline ? 'var(--text-3)' : 'var(--primary)' }}
            >
              <Repeat size={14} /> Đổi sự kiện
            </button>
          </div>

          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
            {snapshot?.concertId === concert?.id && snapshot?.downloadedAt
              ? `Snapshot: ${snapshot.ticketCount} vé, ${snapshot.guestCount} khách · ${new Date(snapshot.downloadedAt).toLocaleString('vi-VN')}`
              : 'Chưa tải dữ liệu cho sự kiện này'}
          </span>
        </div>

        {downloadError && (
          <div className="alert alert-danger" style={{ marginTop: 10, padding: '8px 12px' }}>{downloadError}</div>
        )}
      </header>

      {/* Main Content */}
      <main className="scan-main">
        {activeTab === 'SCANNER'
          ? <ScannerTab concertId={concert!.id} />
          : <VIPTab concertId={concert!.id} />}
      </main>

      {/* Navigation: bottom tab bar on phones, left rail on desktop */}
      <nav className="scan-nav">
        <button
          className={`scan-nav-btn${activeTab === 'SCANNER' ? ' active' : ''}`}
          onClick={() => setActiveTab('SCANNER')}
          aria-current={activeTab === 'SCANNER'}
        >
          <ScanLine size={20} />
          Soát vé
        </button>
        <button
          className={`scan-nav-btn${activeTab === 'VIP' ? ' active' : ''}`}
          onClick={() => setActiveTab('VIP')}
          aria-current={activeTab === 'VIP'}
        >
          <Users size={20} />
          Danh sách VIP
        </button>
      </nav>
    </div>
  );
}
