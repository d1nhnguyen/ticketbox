import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
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
  const navigate = useNavigate();

  const [concerts, setConcerts] = useState<any[]>([]);
  const [selectedConcertId, setSelectedConcertId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    axios
      .get('http://localhost:3000/admin/concerts', {
        headers: { Authorization: `Bearer ${token}` },
      })
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
        const res = await axios.get(
          `http://localhost:3000/admin/concerts/${concertId}/guests/batches`,
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
    if (dropped && (dropped.name.endsWith('.csv') || dropped.type === 'text/csv')) {
      setFile(dropped);
      setError('');
    } else {
      setError('Chỉ chấp nhận file CSV.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && (selected.name.endsWith('.csv') || selected.type === 'text/csv' || selected.type === 'application/vnd.ms-excel')) {
      setFile(selected);
      setError('');
    } else if (selected) {
      setError('Chỉ chấp nhận file CSV.');
    }
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
      const res = await axios.post(
        `http://localhost:3000/admin/concerts/${selectedConcertId}/guests/upload`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
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

  const getStatusColor = (status: string) => {
    if (status === 'SUCCESS') return '#059669';
    if (status === 'FAILED') return '#dc2626';
    if (status === 'PROCESSING') return '#d97706';
    return '#6b7280';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'SUCCESS') return '✅';
    if (status === 'FAILED') return '❌';
    if (status === 'PROCESSING') return '⏳';
    return '❓';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'SUCCESS') return 'Hoàn thành';
    if (status === 'FAILED') return 'Thất bại';
    if (status === 'PROCESSING') return 'Đang xử lý...';
    return status;
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        <button
          onClick={() => navigate('/admin')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6b7280', fontSize: '1rem', padding: '8px',
            borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px'
          }}
        >
          ← Quay lại
        </button>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#111827', margin: 0 }}>
            📋 Guest List CSV Import
          </h1>
          <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '0.95rem' }}>
            Upload danh sách khách mời CSV · Hệ thống tự động dedup và báo lỗi từng dòng
          </p>
        </div>
      </div>

      {/* Card */}
      <div style={{
        background: 'white', borderRadius: '16px', border: '1px solid #e5e7eb',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)', overflow: 'hidden'
      }}>
        {/* Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
          padding: '24px 28px', color: 'white'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📊</div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Import Danh Sách Khách Mời</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '0.9rem' }}>
            Hỗ trợ file lỗi / trùng · Checksum dedup · Xử lý bất đồng bộ qua BullMQ · Không crash khi có dòng lỗi
          </p>
        </div>

        <div style={{ padding: '28px' }}>
          {/* Concert Select */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontWeight: 600, color: '#374151', marginBottom: '8px', fontSize: '0.95rem' }}>
              🎵 Chọn Concert
            </label>
            <select
              value={selectedConcertId}
              onChange={(e) => setSelectedConcertId(e.target.value)}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: '10px',
                border: '1.5px solid #d1d5db', fontSize: '1rem', color: '#111827',
                background: '#f9fafb', cursor: 'pointer', outline: 'none',
                appearance: 'none'
              }}
            >
              {concerts.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
              {concerts.length === 0 && <option value="">-- Không có concert --</option>}
            </select>
          </div>

          {/* Sample files info */}
          <div style={{
            background: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe',
            padding: '12px 16px', marginBottom: '20px', fontSize: '0.85rem', color: '#1e40af'
          }}>
            <strong>💡 Files mẫu để demo:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: '20px', lineHeight: 1.7 }}>
              <li><code>guests-valid.csv</code> — tất cả dòng hợp lệ → rowsOk {'>'} 0</li>
              <li><code>guests-with-errors.csv</code> — có dòng lỗi → rowsFailed {'>'} 0, không crash</li>
              <li><code>guests-duplicates.csv</code> — dòng trùng bị bỏ qua, không insert 2 lần</li>
              <li>Re-upload cùng file → <strong>409 Conflict</strong> (checksum dedup)</li>
            </ul>
          </div>

          {/* Drag & Drop */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontWeight: 600, color: '#374151', marginBottom: '8px', fontSize: '0.95rem' }}>
              📁 File CSV
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('csv-input')?.click()}
              style={{
                border: `2px dashed ${dragOver ? '#0891b2' : file ? '#10b981' : '#d1d5db'}`,
                borderRadius: '12px',
                padding: '40px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? '#f0f9ff' : file ? '#f0fdf4' : '#fafafa',
                transition: 'all 0.2s ease',
              }}
            >
              <input
                id="csv-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              {file ? (
                <>
                  <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📊</div>
                  <div style={{ fontWeight: 700, color: '#059669', fontSize: '1rem' }}>{file.name}</div>
                  <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '4px' }}>
                    {(file.size / 1024).toFixed(1)} KB — Bấm để đổi file
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>☁️</div>
                  <div style={{ fontWeight: 600, color: '#374151', fontSize: '1rem' }}>
                    Kéo thả file CSV vào đây hoặc bấm để chọn
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '6px' }}>
                    Chỉ nhận file CSV (UTF-8)
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px',
              padding: '12px 16px', color: '#dc2626', marginBottom: '20px',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={isUploading || !file || !selectedConcertId}
            style={{
              width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
              background: isUploading || !file || !selectedConcertId
                ? '#e5e7eb'
                : 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
              color: isUploading || !file || !selectedConcertId ? '#9ca3af' : 'white',
              fontWeight: 700, fontSize: '1rem',
              cursor: isUploading || !file || !selectedConcertId ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}
          >
            {isUploading ? '⏳ Đang gửi file...' : '📤 Upload & Import CSV'}
          </button>
        </div>
      </div>

      {/* Batch Result */}
      {batch && (
        <div style={{
          marginTop: '24px',
          background: 'white',
          borderRadius: '16px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
          overflow: 'hidden'
        }}>
          <div style={{
            background: batch.status === 'SUCCESS'
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
              : batch.status === 'FAILED'
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            padding: '16px 24px',
            display: 'flex', alignItems: 'center', gap: '12px', color: 'white'
          }}>
            <span style={{ fontSize: '1.5rem' }}>{getStatusIcon(batch.status)}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                {getStatusLabel(batch.status)}
                {batch.status === 'PROCESSING' && (
                  <span style={{ marginLeft: '8px', fontSize: '0.85rem', opacity: 0.85 }}>
                    (tự động cập nhật mỗi 2s)
                  </span>
                )}
              </div>
              {batch.batchId && (
                <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>Batch ID: {batch.batchId}</div>
              )}
            </div>
          </div>

          <div style={{ padding: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {/* Total */}
              <div style={{
                background: '#f8fafc', borderRadius: '12px', padding: '20px', textAlign: 'center',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#334155' }}>
                  {batch.rowsTotal}
                </div>
                <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px', fontWeight: 500 }}>
                  📊 Tổng dòng
                </div>
              </div>
              {/* OK */}
              <div style={{
                background: '#f0fdf4', borderRadius: '12px', padding: '20px', textAlign: 'center',
                border: '1px solid #bbf7d0'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: getStatusColor('SUCCESS') }}>
                  {batch.rowsOk}
                </div>
                <div style={{ color: '#059669', fontSize: '0.85rem', marginTop: '4px', fontWeight: 500 }}>
                  ✅ Thành công
                </div>
              </div>
              {/* Failed */}
              <div style={{
                background: '#fef2f2', borderRadius: '12px', padding: '20px', textAlign: 'center',
                border: '1px solid #fecaca'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: getStatusColor('FAILED') }}>
                  {batch.rowsFailed}
                </div>
                <div style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '4px', fontWeight: 500 }}>
                  ❌ Lỗi / Bỏ qua
                </div>
              </div>
            </div>

            {batch.status === 'SUCCESS' && batch.rowsFailed > 0 && (
              <div style={{
                marginTop: '16px', background: '#fffbeb', border: '1px solid #fde68a',
                borderRadius: '10px', padding: '12px 16px', color: '#92400e', fontSize: '0.9rem'
              }}>
                ⚠️ <strong>{batch.rowsFailed} dòng bị bỏ qua</strong> do thiếu thông tin bắt buộc hoặc trùng lặp — batch vẫn THÀNH CÔNG, không crash.
              </div>
            )}

            {batch.status === 'SUCCESS' && (
              <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => { setFile(null); setBatch(null); setError(''); }}
                  style={{
                    padding: '10px 20px', borderRadius: '8px',
                    border: '1.5px solid #06b6d4', background: 'white',
                    color: '#0891b2', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem'
                  }}
                >
                  📤 Upload file khác
                </button>
                <button
                  onClick={() => navigate('/admin')}
                  style={{
                    padding: '10px 20px', borderRadius: '8px',
                    border: 'none', background: '#06b6d4',
                    color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem'
                  }}
                >
                  ← Quay lại Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
