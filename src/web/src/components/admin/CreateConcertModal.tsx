import { useState } from 'react';
import apiClient from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

interface CreateConcertModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const emptyForm = { title: '', venue: '', startsAt: '', slug: '', status: 'ON_SALE', imageUrl: '' };

export default function CreateConcertModal({ onClose, onCreated }: CreateConcertModalProps) {
  const { token } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [error, setError] = useState('');

  const handleTitleChange = (value: string) => {
    const slug = value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    setForm((prev) => ({ ...prev, title: value, slug }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsUploadingImage(true);
    try {
      const res = await apiClient.post('/admin/upload/image', formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      const imageUrl = `${import.meta.env.VITE_API_URL}${res.data.imageUrl}`;
      setForm((prev) => ({ ...prev, imageUrl }));
    } catch (err: any) {
      alert('Lỗi khi tải ảnh lên: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async () => {
    const { title, venue, startsAt, slug } = form;
    if (!title || !venue || !startsAt || !slug) {
      setError('Vui lòng điền đầy đủ tất cả các trường.');
      return;
    }

    setIsCreating(true);
    setError('');
    try {
      await apiClient.post(
        '/admin/concerts',
        { title, venue, startsAt: new Date(startsAt).toISOString(), slug, status: form.status, imageUrl: form.imageUrl || undefined },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      onCreated();
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.message;
      if (err.response?.status === 409) setError('Slug này đã tồn tại. Hãy dùng slug khác.');
      else if (Array.isArray(msg)) setError(msg.join(', '));
      else setError(msg || 'Lỗi tạo concert. Vui lòng thử lại.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h2 style={{ fontSize: 18 }}>Tạo sự kiện mới</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="card-body">
          {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}

          <div className="field">
            <label className="label">Tên sự kiện *</label>
            <input
              className="input"
              type="text"
              placeholder="VD: BLACKPINK WORLD TOUR 2026"
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Địa điểm *</label>
            <input
              className="input"
              type="text"
              placeholder="VD: Sân vận động Quốc gia Mỹ Đình"
              value={form.venue}
              onChange={(e) => setForm((prev) => ({ ...prev, venue: e.target.value }))}
            />
          </div>
          <div className="field">
            <label className="label">Ngày & Giờ *</label>
            <input
              className="input"
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm((prev) => ({ ...prev, startsAt: e.target.value }))}
            />
          </div>
          <div className="field">
            <label className="label">Slug (tự động từ tên)</label>
            <input
              className="input"
              type="text"
              placeholder="VD: blackpink-world-tour-2026"
              value={form.slug}
              onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
            />
          </div>
          <div className="field">
            <label className="label">Ảnh bìa (Tải lên hoặc dán Link)</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                className="input"
                type="text"
                placeholder="VD: https://images.unsplash.com/photo-xxx"
                value={form.imageUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
              />
              <label className="btn btn-secondary btn-sm" style={{ cursor: isUploadingImage ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                {isUploadingImage ? 'Đang tải...' : 'Browse...'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={isUploadingImage} />
              </label>
            </div>
            {form.imageUrl && (
              <img src={form.imageUrl} alt="Preview" style={{ height: 100, borderRadius: 8, objectFit: 'cover', marginTop: 10 }} />
            )}
          </div>
          <div className="field">
            <label className="label">Trạng thái *</label>
            <select
              className="select"
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="ON_SALE">ON_SALE — Hiển thị đến khán giả ngay</option>
              <option value="DRAFT">DRAFT — Ẩn khỏi danh sách (chưa công bố)</option>
            </select>
          </div>

          <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 20 }}>
            * Sau khi tạo, bấm <strong>Chi tiết</strong> để thêm Ticket Types (tên/giá/số lượng) và upload AI Bio.
          </p>

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={isCreating}>
              {isCreating ? 'Đang lưu...' : 'Lưu sự kiện'}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Hủy</button>
          </div>
        </div>
      </div>
    </div>
  );
}
