import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, FileSpreadsheet, UploadCloud, FileText } from 'lucide-react';
import apiClient from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

interface BatchResult {
  batchId: string;
  status: string;
  rowsTotal: number;
  rowsOk: number;
  rowsFailed: number;
  filename?: string;
}

export default function CsvUpload() {
  const { token } = useAuth();

  const [concerts, setConcerts] = useState<any[]>([]);
  const [selectedConcertId, setSelectedConcertId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiClient
      .get('/admin/concerts', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setConcerts(res.data);
        if (res.data.length > 0) setSelectedConcertId(res.data[0].id);
      })
      .catch(() => setError('Không thể tải danh sách concert.'));

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [token]);

  const startPolling = (concertId: string, batchId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const res = await apiClient.get(
          `/admin/concerts/${concertId}/guests/batches`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const batches: BatchResult[] = res.data;
        const found = batches.find((b) => b.batchId === batchId || (b as any).id === batchId);
        if (found) {
          setBatch(found);
          if (found.status !== 'PROCESSING') {
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        }
      } catch {
        // silent — keep polling
      }
    }, 2000);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && (dropped.name.endsWith('.csv') || dropped.type === 'text/csv')) { setFile(dropped); setError(''); }
    else setError('Chỉ chấp nhận file CSV.');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && (selected.name.endsWith('.csv') || selected.type === 'text/csv' || selected.type === 'application/vnd.ms-excel')) {
      setFile(selected); setError('');
    } else if (selected) setError('Chỉ chấp nhận file CSV.');
  };

  const handleUpload = async () => {
    if (!file) { setError('Vui lòng chọn file CSV.'); return; }
    if (!selectedConcertId) { setError('Vui lòng chọn concert.'); return; }

    setIsUploading(true);
    setError('');
    setBatch(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiClient.post(
        `/admin/concerts/${selectedConcertId}/guests/upload`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );
      const batchId = res.data.batchId || res.data.id;
      setBatch({ batchId, status: 'PROCESSING', rowsTotal: 0, rowsOk: 0, rowsFailed: 0 });
      startPolling(selectedConcertId, batchId);
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 409) setError('File CSV này đã được import trước đó vào hệ thống (checksum trùng). Dedup theo nội dung file — không phân biệt concert. Hãy dùng file khác hoặc sửa nội dung.');
      else if (status === 403) setError('Bạn không có quyền thực hiện thao tác này (chỉ ORGANIZER).');
      else if (status === 400) setError('File không hợp lệ. Vui lòng kiểm tra lại.');
      else setError(err.response?.data?.message || 'Lỗi không xác định khi upload.');
    } finally {
      setIsUploading(false);
    }
  };

  const statusBadgeClass = (status: string) => {
    if (status === 'SUCCESS') return 'badge badge-success';
    if (status === 'FAILED') return 'badge badge-danger';
    if (status === 'PROCESSING') return 'badge badge-warning';
    return 'badge badge-muted';
  };

  const statusLabel = (status: string) => {
    if (status === 'SUCCESS') return 'Hoàn thành';
    if (status === 'FAILED') return 'Thất bại';
    if (status === 'PROCESSING') return 'Đang xử lý...';
    return status;
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <Link to="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
        <ChevronLeft size={16} /> Quay lại
      </Link>
      <div className="page-header">
        <div>
          <div className="page-title">Guest List CSV Import</div>
          <div className="page-subtitle">Upload danh sách khách mời CSV · Hệ thống tự động dedup và báo lỗi từng dòng</div>
        </div>
      </div>

      <div className="card">
        <div style={{ background: 'var(--brand-gradient)', padding: '24px 28px', color: 'white', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
          <FileSpreadsheet size={28} style={{ marginBottom: 8 }} />
          <h2 style={{ fontSize: 18, color: 'white' }}>Import Danh Sách Khách Mời</h2>
          <p style={{ opacity: 0.85, fontSize: 14, marginTop: 4 }}>
            Hỗ trợ file lỗi / trùng · Checksum dedup · Xử lý bất đồng bộ qua BullMQ · Không crash khi có dòng lỗi
          </p>
        </div>

        <div className="card-body">
          <div className="field">
            <label className="label">Chọn Concert</label>
            <select className="select" value={selectedConcertId} onChange={(e) => setSelectedConcertId(e.target.value)}>
              {concerts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              {concerts.length === 0 && <option value="">-- Không có concert --</option>}
            </select>
          </div>

          <div className="alert alert-info" style={{ marginBottom: 20 }}>
            <strong>Files mẫu để demo:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>
              <li><code>guests-valid.csv</code> — tất cả dòng hợp lệ → rowsOk {'>'} 0</li>
              <li><code>guests-with-errors.csv</code> — có dòng lỗi → rowsFailed {'>'} 0, không crash</li>
              <li><code>guests-duplicates.csv</code> — dòng trùng bị bỏ qua, không insert 2 lần</li>
              <li>Re-upload cùng file → <strong>409 Conflict</strong> (checksum dedup)</li>
            </ul>
          </div>

          <div className="field">
            <label className="label">File CSV</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('csv-input')?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--info)' : file ? 'var(--success)' : 'var(--border-strong)'}`,
                borderRadius: 'var(--radius-md)', padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
                background: dragOver ? 'var(--info-bg)' : file ? 'var(--success-bg)' : 'var(--surface-2)',
              }}
            >
              <input id="csv-input" type="file" accept=".csv,text/csv" onChange={handleFileChange} style={{ display: 'none' }} />
              {file ? (
                <>
                  <FileText size={32} style={{ margin: '0 auto 8px', color: 'var(--success)' }} />
                  <div style={{ fontWeight: 700, color: 'var(--success)' }}>{file.name}</div>
                  <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB — Bấm để đổi file</div>
                </>
              ) : (
                <>
                  <UploadCloud size={32} style={{ margin: '0 auto 8px', color: 'var(--text-3)' }} />
                  <div style={{ fontWeight: 600 }}>Kéo thả file CSV vào đây hoặc bấm để chọn</div>
                  <div style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 6 }}>Chỉ nhận file CSV (UTF-8)</div>
                </>
              )}
            </div>
          </div>

          {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>{error}</div>}

          <button className="btn btn-primary" onClick={handleUpload} disabled={isUploading || !file || !selectedConcertId} style={{ width: '100%' }}>
            {isUploading ? 'Đang gửi file...' : 'Upload & Import CSV'}
          </button>
        </div>
      </div>

      {batch && (
        <div className="card" style={{ marginTop: 24 }}>
          <div style={{
            background: batch.status === 'SUCCESS' ? 'var(--success)' : batch.status === 'FAILED' ? 'var(--danger)' : 'var(--warning)',
            padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, color: 'white',
            borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          }}>
            <span className={statusBadgeClass(batch.status)} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', borderColor: 'transparent' }}>
              {statusLabel(batch.status)}
            </span>
            <div>
              {batch.status === 'PROCESSING' && (
                <div style={{ fontSize: 13, opacity: 0.9 }}>Tự động cập nhật mỗi 2s</div>
              )}
              {batch.batchId && <div style={{ fontSize: 12, opacity: 0.85 }}>Batch ID: {batch.batchId}</div>}
            </div>
          </div>

          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <div className="stat-card" style={{ alignItems: 'center', textAlign: 'center' }}>
                <span className="stat-value">{batch.rowsTotal}</span>
                <span className="stat-label">Tổng dòng</span>
              </div>
              <div className="stat-card" style={{ alignItems: 'center', textAlign: 'center', background: 'var(--success-bg)', borderColor: 'var(--success-border)' }}>
                <span className="stat-value" style={{ color: 'var(--success)' }}>{batch.rowsOk}</span>
                <span className="stat-label" style={{ color: 'var(--success)' }}>Thành công</span>
              </div>
              <div className="stat-card" style={{ alignItems: 'center', textAlign: 'center', background: 'var(--danger-bg)', borderColor: 'var(--danger-border)' }}>
                <span className="stat-value" style={{ color: 'var(--danger)' }}>{batch.rowsFailed}</span>
                <span className="stat-label" style={{ color: 'var(--danger)' }}>Lỗi / Bỏ qua</span>
              </div>
            </div>

            {batch.status === 'SUCCESS' && batch.rowsFailed > 0 && (
              <div className="alert alert-warning" style={{ marginTop: 16 }}>
                <strong>{batch.rowsFailed} dòng bị bỏ qua</strong> do thiếu thông tin bắt buộc hoặc trùng lặp — batch vẫn THÀNH CÔNG, không crash.
              </div>
            )}

            {batch.status === 'SUCCESS' && (
              <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                <button className="btn btn-secondary" onClick={() => { setFile(null); setBatch(null); setError(''); }}>
                  Upload file khác
                </button>
                <Link to="/admin" className="btn btn-primary">Quay lại Dashboard</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
