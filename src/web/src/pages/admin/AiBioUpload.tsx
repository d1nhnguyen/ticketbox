import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';

export default function AiBioUpload() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [concerts, setConcerts] = useState<any[]>([]);
  const [selectedConcertId, setSelectedConcertId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [bio, setBio] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

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
  }, [token]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === 'application/pdf') {
      setFile(dropped);
      setError('');
    } else {
      setError('Chỉ chấp nhận file PDF.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type === 'application/pdf') {
      setFile(selected);
      setError('');
    } else if (selected) {
      setError('Chỉ chấp nhận file PDF.');
    }
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
      const res = await axios.post(
        `http://localhost:3000/concerts/${selectedConcertId}/bio`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
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
            🤖 AI Artist Bio Generator
          </h1>
          <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '0.95rem' }}>
            Upload press-kit PDF → AI tự động tạo tiểu sử nghệ sĩ chuyên nghiệp
          </p>
        </div>
      </div>

      {/* Card */}
      <div style={{
        background: 'white', borderRadius: '16px', border: '1px solid #e5e7eb',
        boxShadow: '0 4px 24px rgba(0,0,0,0.07)', overflow: 'hidden'
      }}>
        {/* Gradient banner */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '24px 28px', color: 'white'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✨</div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Tạo Bio bằng AI</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '0.9rem' }}>
            Hệ thống sử dụng Gemini AI để phân tích press kit và tạo ra đoạn giới thiệu nghệ sĩ 3-4 câu tự nhiên và chuyên nghiệp.
          </p>
        </div>

        <div style={{ padding: '28px' }}>
          {/* Select Concert */}
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

          {/* Drag & Drop Zone */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontWeight: 600, color: '#374151', marginBottom: '8px', fontSize: '0.95rem' }}>
              📄 Press-kit PDF
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('pdf-input')?.click()}
              style={{
                border: `2px dashed ${dragOver ? '#7c3aed' : file ? '#10b981' : '#d1d5db'}`,
                borderRadius: '12px',
                padding: '40px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? '#f5f3ff' : file ? '#f0fdf4' : '#fafafa',
                transition: 'all 0.2s ease',
              }}
            >
              <input
                id="pdf-input"
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              {file ? (
                <>
                  <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📑</div>
                  <div style={{ fontWeight: 700, color: '#059669', fontSize: '1rem' }}>{file.name}</div>
                  <div style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '4px' }}>
                    {(file.size / 1024).toFixed(1)} KB — Bấm để đổi file
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>☁️</div>
                  <div style={{ fontWeight: 600, color: '#374151', fontSize: '1rem' }}>
                    Kéo thả file PDF vào đây hoặc bấm để chọn
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '6px' }}>
                    Chỉ nhận file PDF · Tối đa 20MB
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
                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: isUploading || !file || !selectedConcertId ? '#9ca3af' : 'white',
              fontWeight: 700, fontSize: '1rem', cursor: isUploading || !file || !selectedConcertId ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}
          >
            {isUploading ? (
              <>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                AI đang phân tích press kit...
              </>
            ) : (
              '🚀 Tạo Artist Bio bằng AI'
            )}
          </button>
        </div>
      </div>

      {/* Result */}
      {bio && (
        <div style={{
          marginTop: '24px',
          background: 'white',
          borderRadius: '16px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
          overflow: 'hidden'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            padding: '16px 24px',
            display: 'flex', alignItems: 'center', gap: '12px', color: 'white'
          }}>
            <span style={{ fontSize: '1.5rem' }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>Bio đã được tạo thành công!</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Đã lưu vào database và sẽ hiển thị trên trang chi tiết concert.</div>
            </div>
          </div>
          <div style={{ padding: '24px' }}>
            <h3 style={{ color: '#374151', fontWeight: 700, marginBottom: '12px', fontSize: '1rem' }}>
              📝 Nội dung Artist Bio:
            </h3>
            <div style={{
              background: '#f8fafc',
              borderLeft: '4px solid #667eea',
              borderRadius: '0 10px 10px 0',
              padding: '16px 20px',
              color: '#1e293b',
              lineHeight: 1.8,
              fontSize: '0.95rem',
              whiteSpace: 'pre-wrap'
            }}>
              {bio}
            </div>
            <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
              <button
                onClick={() => navigator.clipboard.writeText(bio)}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: '1.5px solid #667eea', background: 'white',
                  color: '#667eea', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem'
                }}
              >
                📋 Sao chép
              </button>
              <button
                onClick={() => navigate('/admin')}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: 'none', background: '#667eea',
                  color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem'
                }}
              >
                ← Quay lại Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
