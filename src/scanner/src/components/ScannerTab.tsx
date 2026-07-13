import { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '../db/db';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

export default function ScannerTab() {
  const [scanResult, setScanResult] = useState<{ status: 'IDLE' | 'SUCCESS' | 'ERROR' | 'CONFLICT', message: string }>({ status: 'IDLE', message: '' });
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    // Listen for sync conflicts
    const handleConflict = (e: any) => {
      if (e.detail?.ticketId) {
        setScanResult({ status: 'CONFLICT', message: `Phát hiện quét trùng trên máy khác! (Vé: ${e.detail.ticketId})` });
      }
    };
    window.addEventListener('sync-conflict', handleConflict);
    return () => window.removeEventListener('sync-conflict', handleConflict);
  }, []);

  const onScanSuccess = async (decodedText: string) => {
    // Ngưng quét tạm thời để xử lý
    if (scannerRef.current) {
      scannerRef.current.pause(true);
    }

    try {
      // 1. Kiểm tra vé có trong DB hợp lệ không
      const ticket = await db.validTickets.get(decodedText);
      if (!ticket) {
        setScanResult({ status: 'ERROR', message: 'Mã QR không hợp lệ hoặc không thuộc sự kiện này!' });
        resumeScan();
        return;
      }

      // 2. Chống quét trùng (Double-scan guard) offline
      const duplicate = await db.scanQueue.where({ ticketId: ticket.ticketId }).first();
      if (duplicate) {
        setScanResult({ status: 'ERROR', message: 'Vé này ĐÃ ĐƯỢC QUÉT trên thiết bị này!' });
        resumeScan();
        return;
      }

      // 3. Chấp nhận offline và đưa vào hàng đợi đồng bộ
      await db.scanQueue.add({
        clientLogId: crypto.randomUUID(),
        ticketId: ticket.ticketId,
        deviceId: 'DEVICE_' + Math.floor(Math.random() * 1000), // Có thể lấy từ localStorage
        scannedAt: new Date().toISOString(),
        syncStatus: 'PENDING'
      });

      setScanResult({ status: 'SUCCESS', message: 'Thành công! (Đã ghi nhận offline)' });
      resumeScan();

    } catch (err) {
      console.error(err);
      setScanResult({ status: 'ERROR', message: 'Lỗi hệ thống khi xử lý vé.' });
      resumeScan();
    }
  };

  const resumeScan = () => {
    setTimeout(() => {
      setScanResult({ status: 'IDLE', message: '' });
      if (scannerRef.current) {
        scannerRef.current.resume();
      }
    }, 3000);
  };

  const startScanner = async () => {
    try {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;
      
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        () => {} // Ignore scan errors
      );
      setIsScanning(true);
    } catch (err) {
      console.error("Camera access failed", err);
      setScanResult({ status: 'ERROR', message: 'Không thể mở Camera. Kiểm tra quyền truy cập.' });
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && isScanning) {
      await scannerRef.current.stop();
      scannerRef.current.clear();
      setIsScanning(false);
    }
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', textAlign: 'center' }}>📷 Quét Mã QR</h2>
      
      {!isScanning ? (
        <button 
          onClick={startScanner}
          style={{ width: '100%', padding: '15px', background: '#2563eb', color: 'white', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
        >
          Mở Camera
        </button>
      ) : (
        <button 
          onClick={stopScanner}
          style={{ width: '100%', padding: '15px', background: '#ef4444', color: 'white', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', border: 'none', cursor: 'pointer', marginBottom: '20px' }}
        >
          Đóng Camera
        </button>
      )}

      <div id="reader" style={{ width: '100%', marginTop: '20px', borderRadius: '12px', overflow: 'hidden', border: isScanning ? '2px solid #2563eb' : 'none' }}></div>

      {scanResult.status !== 'IDLE' && (
        <div style={{
          marginTop: '20px', padding: '20px', borderRadius: '12px', textAlign: 'center',
          background: scanResult.status === 'SUCCESS' ? '#dcfce7' : scanResult.status === 'ERROR' ? '#fee2e2' : '#fef9c3',
          border: `2px solid ${scanResult.status === 'SUCCESS' ? '#22c55e' : scanResult.status === 'ERROR' ? '#ef4444' : '#eab308'}`
        }}>
          {scanResult.status === 'SUCCESS' && <CheckCircle2 size={40} color="#16a34a" style={{ margin: '0 auto' }}/>}
          {scanResult.status === 'ERROR' && <XCircle size={40} color="#dc2626" style={{ margin: '0 auto' }}/>}
          {scanResult.status === 'CONFLICT' && <AlertTriangle size={40} color="#ca8a04" style={{ margin: '0 auto' }}/>}
          
          <h3 style={{ marginTop: '10px', fontSize: '1.2rem', color: scanResult.status === 'SUCCESS' ? '#166534' : scanResult.status === 'ERROR' ? '#991b1b' : '#854d0e' }}>
            {scanResult.message}
          </h3>
        </div>
      )}
    </div>
  );
}
