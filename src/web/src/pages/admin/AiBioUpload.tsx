import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Sparkles, UploadCloud, FileText, CheckCircle2 } from 'lucide-react';
import apiClient from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

export default function AiBioUpload() {
  const { token } = useAuth();

  const [concerts, setConcerts] = useState<any[]>([]);
  const [selectedConcertId, setSelectedConcertId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [bio, setBio] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    apiClient
      .get('/admin/concerts', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setConcerts(res.data);
        if (res.data.length > 0) setSelectedConcertId(res.data[0].id);
      })
      .catch(() => setError('Không thể tải danh sách concert.'));
  }, [token]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === 'application/pdf') { setFile(dropped); setError(''); }
    else setError('Chỉ chấp nhận file PDF.');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type === 'application/pdf') { setFile(selected); setError(''); }
    else if (selected) setError('Chỉ chấp nhận file PDF.');
  };

  const handleUpload = async () => {
    if (!file) { setError('Vui lòng chọn file PDF.'); return; }
    if (!selectedConcertId) { setError('Vui lòng chọn concert.'); return; }

    setIsUploading(true);
    setError('');
    setBio(null);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const res = await apiClient.post(`/concerts/${selectedConcertId}/bio`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      setBio(res.data.bio || res.data.artistBio || JSON.stringify(res.data));
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 403) setError('Bạn không có quyền thực hiện thao tác này (chỉ ORGANIZER).');
      else if (status === 400) setError('File không hợp lệ hoặc thiếu dữ liệu. Vui lòng kiểm tra lại.');
      else setError(err.response?.data?.message || 'Lỗi không xác định khi upload.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <Link to="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
        <ChevronLeft size={16} /> Quay lại
      </Link>
      <div className="page-header">
        <div>
          <div className="page-title">AI Artist Bio Generator</div>
          <div className="page-subtitle">Upload press-kit PDF → AI tự động tạo tiểu sử nghệ sĩ chuyên nghiệp</div>
        </div>
      </div>

      <div className="card">
        <div style={{ background: 'var(--brand-gradient)', padding: '24px 28px', color: 'white', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
          <Sparkles size={28} style={{ marginBottom: 8 }} />
          <h2 style={{ fontSize: 18, color: 'white' }}>Tạo Bio bằng AI</h2>
          <p style={{ opacity: 0.85, fontSize: 14, marginTop: 4 }}>
            Hệ thống sử dụng Gemini AI để phân tích press kit và tạo ra đoạn giới thiệu nghệ sĩ 3-4 câu tự nhiên và chuyên nghiệp.
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

          <div className="field">
            <label className="label">Press-kit PDF</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('pdf-input')?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--accent)' : file ? 'var(--success)' : 'var(--border-strong)'}`,
                borderRadius: 'var(--radius-md)', padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
                background: dragOver ? 'var(--primary-soft)' : file ? 'var(--success-bg)' : 'var(--surface-2)',
              }}
            >
              <input id="pdf-input" type="file" accept="application/pdf" onChange={handleFileChange} style={{ display: 'none' }} />
              {file ? (
                <>
                  <FileText size={32} style={{ margin: '0 auto 8px', color: 'var(--success)' }} />
                  <div style={{ fontWeight: 700, color: 'var(--success)' }}>{file.name}</div>
                  <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB — Bấm để đổi file</div>
                </>
              ) : (
                <>
                  <UploadCloud size={32} style={{ margin: '0 auto 8px', color: 'var(--text-3)' }} />
                  <div style={{ fontWeight: 600 }}>Kéo thả file PDF vào đây hoặc bấm để chọn</div>
                  <div style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 6 }}>Chỉ nhận file PDF · Tối đa 20MB</div>
                </>
              )}
            </div>
          </div>

          {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>{error}</div>}

          <button className="btn btn-primary" onClick={handleUpload} disabled={isUploading || !file || !selectedConcertId} style={{ width: '100%' }}>
            {isUploading ? 'AI đang phân tích press kit...' : 'Tạo Artist Bio bằng AI'}
          </button>
        </div>
      </div>

      {bio && (
        <div className="card" style={{ marginTop: 24 }}>
          <div style={{ background: 'var(--success)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, color: 'white', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
            <CheckCircle2 size={22} />
            <div>
              <div style={{ fontWeight: 700, color: 'white' }}>Bio đã được tạo thành công!</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Đã lưu vào database và sẽ hiển thị trên trang chi tiết concert.</div>
            </div>
          </div>
          <div className="card-body">
            <h3 style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>Nội dung Artist Bio:</h3>
            <div style={{
              background: 'var(--surface-2)', borderLeft: '4px solid var(--accent)', borderRadius: '0 var(--radius-md) var(--radius-md) 0',
              padding: '16px 20px', lineHeight: 1.8, fontSize: 15, whiteSpace: 'pre-wrap',
            }}>
              {bio}
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(bio)}>Sao chép</button>
              <Link to="/admin" className="btn btn-primary">Quay lại Dashboard</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
