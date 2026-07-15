import { useCallback, useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '../db/db';
import { getDeviceId } from '../services/session';
import { syncPendingRecords } from '../services/syncEngine';
import { CheckCircle2, XCircle, AlertTriangle, ClipboardPaste, Keyboard, ScanLine } from 'lucide-react';

interface Props {
  concertId: string;
}

interface SyncConflictDetail {
  ticketId?: string;
}

type ScanResult = { status: 'IDLE' | 'SUCCESS' | 'ERROR' | 'CONFLICT'; message: string };

export default function ScannerTab({ concertId }: Props) {
  const [scanResult, setScanResult] = useState<ScanResult>({ status: 'IDLE', message: '' });
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const resumeTimeoutRef = useRef<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Manual input state
  const [manualCode, setManualCode] = useState('');
  const [isManualLoading, setIsManualLoading] = useState(false);
  const [isPasteLoading, setIsPasteLoading] = useState(false);

  useEffect(() => {
    const handleConflict = (event: Event) => {
      const { ticketId } = (event as CustomEvent<SyncConflictDetail>).detail ?? {};
      if (ticketId) {
        setScanResult({ status: 'CONFLICT', message: `Phát hiện quét trùng trên máy khác! (Vé: ${ticketId})` });
      }
    };
    window.addEventListener('sync-conflict', handleConflict);
    return () => window.removeEventListener('sync-conflict', handleConflict);
  }, []);

  /** Core logic: xử lý một mã QR text bất kể nguồn nào (camera / clipboard / thủ công) */
  const processQrText = async (decodedText: string) => {
    const code = decodedText.trim();
    if (!code) return;

    try {
      const ticket = await db.validTickets.get(code);
      if (!ticket || ticket.concertId !== concertId) {
        setScanResult({ status: 'ERROR', message: 'Mã QR không hợp lệ hoặc không thuộc sự kiện này!' });
        return;
      }

      const duplicate = await db.scanQueue.where({ ticketId: ticket.ticketId }).first();
      if (duplicate) {
        setScanResult({ status: 'ERROR', message: 'Vé này ĐÃ ĐƯỢC QUÉT trên thiết bị này!' });
        return;
      }

      await db.scanQueue.add({
        clientLogId: crypto.randomUUID(),
        ticketId: ticket.ticketId,
        deviceId: getDeviceId(),
        scannedAt: new Date().toISOString(),
        syncStatus: 'PENDING',
      });

      setScanResult({ status: 'SUCCESS', message: `Thành công! Vé đã được ghi nhận.` });
      void syncPendingRecords();
    } catch (err) {
      console.error(err);
      setScanResult({ status: 'ERROR', message: 'Lỗi hệ thống khi xử lý vé.' });
    }
  };

  // ---- Camera scanning ----

  const onScanSuccess = async (decodedText: string) => {
    if (scannerRef.current) scannerRef.current.pause(true);
    await processQrText(decodedText);
    resumeScan();
  };

  const resumeScan = useCallback(() => {
    if (resumeTimeoutRef.current !== null) window.clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = window.setTimeout(() => {
      resumeTimeoutRef.current = null;
      setScanResult({ status: 'IDLE', message: '' });
      if (scannerRef.current?.isScanning) scannerRef.current.resume();
    }, 3000);
  }, []);

  const startScanner = async () => {
    try {
      const html5QrCode = new Html5Qrcode('reader');
      scannerRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        () => {},
      );
      setIsScanning(true);
    } catch (err) {
      console.error('Camera access failed', err);
      setScanResult({ status: 'ERROR', message: 'Không thể mở Camera. Kiểm tra quyền truy cập.' });
    }
  };

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    scannerRef.current = null;
    try {
      if (scanner.isScanning) await scanner.stop();
    } finally {
      scanner.clear();
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current !== null) window.clearTimeout(resumeTimeoutRef.current);
      void stopScanner();
    };
  }, [stopScanner]);

  // ---- Clipboard paste ----

  const handlePasteFromClipboard = async () => {
    setIsPasteLoading(true);
    setScanResult({ status: 'IDLE', message: '' });
    try {
      const items = await navigator.clipboard.read();
      let imageBlob: Blob | null = null;

      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            imageBlob = await item.getType(type);
            break;
          }
        }
        if (imageBlob) break;
      }

      if (!imageBlob) {
        // Thử đọc text (trường hợp copy raw text QR code)
        const text = await navigator.clipboard.readText();
        if (text.trim()) {
          await processQrText(text.trim());
          return;
        }
        setScanResult({ status: 'ERROR', message: 'Clipboard không có ảnh QR hoặc text mã vé.' });
        return;
      }

      // Decode QR từ ảnh trong clipboard
      const imageUrl = URL.createObjectURL(imageBlob);
      const tempScanner = new Html5Qrcode('clipboard-decoder');
      try {
        const result = await tempScanner.scanFileV2(
          new File([imageBlob], 'clipboard.png', { type: imageBlob.type }),
          false,
        );
        await processQrText(result.decodedText);
      } finally {
        tempScanner.clear();
        URL.revokeObjectURL(imageUrl);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('No MultiFormat Readers') || msg.includes('No QR')) {
        setScanResult({ status: 'ERROR', message: 'Ảnh trong clipboard không chứa mã QR hợp lệ.' });
      } else if (msg.includes('permission') || msg.includes('NotAllowed')) {
        setScanResult({ status: 'ERROR', message: 'Trình duyệt từ chối quyền đọc clipboard. Hãy cho phép trong Settings.' });
      } else {
        console.error(err);
        setScanResult({ status: 'ERROR', message: 'Không thể đọc clipboard: ' + msg });
      }
    } finally {
      setIsPasteLoading(false);
    }
  };

  // ---- Manual text input ----

  const handleManualSubmit = async () => {
    if (!manualCode.trim()) return;
    setIsManualLoading(true);
    setScanResult({ status: 'IDLE', message: '' });
    await processQrText(manualCode.trim());
    setManualCode('');
    setIsManualLoading(false);
  };

  const resultAlertClass =
    scanResult.status === 'SUCCESS' ? 'alert-success' :
      scanResult.status === 'ERROR' ? 'alert-danger' : 'alert-warning';

  return (
    <div style={{ padding: 20, maxWidth: 500, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, marginBottom: 20, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <ScanLine size={22} color="var(--primary)" /> Quét Mã QR
      </h2>

      {/* ---- Clipboard paste button ---- */}
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={handlePasteFromClipboard}
          disabled={isPasteLoading}
          className="btn btn-block"
          style={{
            border: '2px dashed var(--accent)', borderRadius: 'var(--radius-md)',
            background: isPasteLoading ? 'var(--primary-soft-border)' : 'var(--primary-soft)', color: 'var(--accent)',
          }}
        >
          <ClipboardPaste size={20} />
          {isPasteLoading ? 'Đang đọc clipboard...' : 'Dán QR từ Clipboard (Ctrl+C ảnh → bấm đây)'}
        </button>
        <p style={{ margin: '6px 0 0 4px', color: 'var(--text-3)', fontSize: 12 }}>
          Chụp màn hình QR → copy → paste vào đây. Hoặc copy text mã vé cũng được.
        </p>
      </div>

      {/* ---- Manual text input ---- */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Keyboard size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleManualSubmit(); }}
              placeholder="Dán / nhập mã vé thủ công rồi Enter..."
              className="input"
              style={{ paddingLeft: 34 }}
            />
          </div>
          <button
            onClick={handleManualSubmit}
            disabled={isManualLoading || !manualCode.trim()}
            className="btn btn-success"
          >
            {isManualLoading ? '...' : 'Kiểm tra'}
          </button>
        </div>
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ color: 'var(--text-3)', fontSize: 13, whiteSpace: 'nowrap' }}>hoặc dùng Camera</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* ---- Camera ---- */}
      {!isScanning ? (
        <button onClick={startScanner} className="btn btn-primary btn-block" style={{ padding: 15, fontSize: 16 }}>
          Mở Camera
        </button>
      ) : (
        <button onClick={stopScanner} className="btn btn-danger btn-block" style={{ padding: 15, fontSize: 16, marginBottom: 20 }}>
          Đóng Camera
        </button>
      )}

      {/* Vùng render camera */}
      <div id="reader" style={{ width: '100%', marginTop: 12, borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: isScanning ? '2px solid var(--primary)' : 'none' }} />

      {/* Hidden div dùng để decode ảnh clipboard — không hiện ra ngoài */}
      <div id="clipboard-decoder" style={{ display: 'none' }} />

      {/* ---- Kết quả ---- */}
      {scanResult.status !== 'IDLE' && (
        <div className={`alert ${resultAlertClass}`} style={{ marginTop: 20, padding: 20, textAlign: 'center' }}>
          {scanResult.status === 'SUCCESS' && <CheckCircle2 size={40} color="var(--success)" style={{ margin: '0 auto' }} />}
          {scanResult.status === 'ERROR' && <XCircle size={40} color="var(--danger)" style={{ margin: '0 auto' }} />}
          {scanResult.status === 'CONFLICT' && <AlertTriangle size={40} color="var(--warning)" style={{ margin: '0 auto' }} />}
          <h3 style={{ marginTop: 10, fontSize: 16 }}>{scanResult.message}</h3>
        </div>
      )}
    </div>
  );
}
