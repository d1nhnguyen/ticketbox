import { useState, useEffect } from 'react';
import ScannerTab from './components/ScannerTab';
import VIPTab from './components/VIPTab';
import { startSyncEngine } from './services/syncEngine';
import { db } from './db/db';
import { Wifi, WifiOff, DownloadCloud } from 'lucide-react';
import './App.css'; // Just basic reset

export default function App() {
  const [activeTab, setActiveTab] = useState<'SCANNER' | 'VIP'>('SCANNER');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    // Khởi chạy Sync Engine
    startSyncEngine();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handlePreDownload = async () => {
    if (!isOnline) {
      alert('Vui lòng kết nối mạng để tải dữ liệu!');
      return;
    }
    
    setIsDownloading(true);
    try {
      // Vì API backend chưa có, ta sẽ MOCK dữ liệu tại đây
      // Khi có API thật, sẽ gọi axios.get('/concerts/:id/tickets/valid') và '/guests'
      
      const mockTickets = [
        { qrCode: 'TICKET-12345', ticketId: 't1', concertId: 'c1', ticketTypeId: 'tt1', maxPerUser: 4 },
        { qrCode: 'TICKET-67890', ticketId: 't2', concertId: 'c1', ticketTypeId: 'tt1', maxPerUser: 4 }
      ];

      const mockGuests = [
        { id: 'g1', docId: '0123456789', fullName: 'Nguyen Van A', concertId: 'c1', zone: 'VIP', status: 'INVITED' as const },
        { id: 'g2', docId: '9876543210', fullName: 'Le Thi B', concertId: 'c1', zone: 'SVIP', status: 'INVITED' as const }
      ];

      await db.validTickets.clear();
      await db.validTickets.bulkAdd(mockTickets);

      await db.guests.clear();
      await db.guests.bulkAdd(mockGuests);

      alert('Đã tải thành công 2 vé và 2 khách mời (Dữ liệu Mock)! Bạn có thể ngắt mạng để test thử Offline Mode.');

    } catch (err) {
      console.error(err);
      alert('Lỗi tải dữ liệu.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ background: 'white', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', position: 'sticky', top: 0, zIndex: 10 }}>
        <h1 style={{ margin: 0, fontSize: '1.2rem', color: '#111827', fontWeight: 800 }}>🎫 TB Scanner</h1>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button 
            onClick={handlePreDownload}
            disabled={!isOnline || isDownloading}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: (!isOnline || isDownloading) ? '#9ca3af' : '#2563eb', fontWeight: 600, cursor: (!isOnline || isDownloading) ? 'not-allowed' : 'pointer' }}
          >
            <DownloadCloud size={20} />
            {isDownloading ? 'Đang tải...' : 'Tải dữ liệu'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: isOnline ? '#16a34a' : '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>
            {isOnline ? <><Wifi size={18} /> Online</> : <><WifiOff size={18} /> Offline</>}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ paddingBottom: '70px' }}>
        {activeTab === 'SCANNER' ? <ScannerTab /> : <VIPTab />}
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
