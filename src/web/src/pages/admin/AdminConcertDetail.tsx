import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import apiClient from '../../api/client';
import { useAuth } from '../../hooks/useAuth';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TicketType {
  id: string;
  name: string;
  price: number;
  totalQty: number;
  remainingQty: number;
  maxPerUser: number;
  saleStartsAt: string;
}

interface GuestBatch {
  id: string;
  filename: string;
  status: string;
  rowsTotal: number;
  rowsOk: number;
  rowsFailed: number;
  createdAt: string;
}

interface GuestEntry {
  id: string;
  fullName: string;
  docId: string | null;
  zone: string;
  status: string;
}

interface Concert {
  id: string;
  title: string;
  slug: string;
  venue: string;
  startsAt: string;
  status: string;
  artistBio?: string;
  imageUrl?: string | null;
  ticketTypes: TicketType[];
}

interface ConcertStats {
  totalRevenue: number;
  totalOrders: number;
  ticketTypes: Array<{
    id: string;
    soldQty: number;
    revenue: number;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusBadgeClass = (status: string) => {
  if (status === 'ON_SALE') return 'badge badge-success';
  if (status === 'DRAFT') return 'badge badge-muted';
  return 'badge badge-danger'; // SOLD_OUT / CANCELLED
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminConcertDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const authHeader = { Authorization: `Bearer ${token}` };

  // Concert state
  const [concert, setConcert] = useState<Concert | null>(null);
  const [stats, setStats] = useState<ConcertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tickets' | 'bio' | 'guests' | 'info'>('tickets');

  // ── Edit Concert Info ─────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState({ title: '', venue: '', startsAt: '', slug: '', status: '', imageUrl: '' });
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [infoSuccess, setInfoSuccess] = useState('');

  // ── Ticket Types ─────────────────────────────────────────────────────────
  const [ttForm, setTtForm] = useState({
    name: '', price: '', totalQty: '', maxPerUser: '', saleStartsAt: '',
  });
  const [ttError, setTtError] = useState('');
  const [ttSuccess, setTtSuccess] = useState('');
  const [isSavingTt, setIsSavingTt] = useState(false);
  const [editTt, setEditTt] = useState<TicketType | null>(null);

  // ── AI Bio ────────────────────────────────────────────────────────────────
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploadingBio, setIsUploadingBio] = useState(false);
  const [bioError, setBioError] = useState('');
  const [bioDragOver, setBioDragOver] = useState(false);

  // ── Guest List (CSV) ──────────────────────────────────────────────────────
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [csvDragOver, setCsvDragOver] = useState(false);
  const [batches, setBatches] = useState<GuestBatch[]>([]);
  const [guests, setGuests] = useState<GuestEntry[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch concert ─────────────────────────────────────────────────────────

  const fetchConcert = async () => {
    try {
      const res = await apiClient.get(`/admin/concerts/${id}`, { headers: authHeader });
      setConcert(res.data);
      // Sync edit form whenever concert data refreshes
      setEditForm({
        title: res.data.title,
        venue: res.data.venue,
        startsAt: res.data.startsAt ? res.data.startsAt.slice(0, 16) : '',
        slug: res.data.slug,
        status: res.data.status,
        imageUrl: res.data.imageUrl || '',
      });
    } catch {
      navigate('/admin/concerts');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await apiClient.get<ConcertStats>(`/admin/concerts/${id}/stats`, {
        headers: authHeader,
      });
      setStats(res.data);
    } catch {
      setStats(null);
    }
  };

  const fetchBatches = async () => {
    try {
      const res = await apiClient.get(`/admin/concerts/${id}/guests/batches`, { headers: authHeader });
      setBatches(res.data);
    } catch { /* silent */ }
  };

  const fetchGuests = async () => {
    try {
      const res = await apiClient.get(`/admin/concerts/${id}/guests/list`, { headers: authHeader });
      setGuests(res.data);
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchConcert();
    fetchStats();
    fetchBatches();
    fetchGuests();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Ticket Type handlers ──────────────────────────────────────────────────

  const resetTtForm = () => {
    setTtForm({ name: '', price: '', totalQty: '', maxPerUser: '', saleStartsAt: '' });
    setEditTt(null);
    setTtError('');
    setTtSuccess('');
  };

  const openEditTt = (tt: TicketType) => {
    setEditTt(tt);
    setTtForm({
      name: tt.name,
      price: String(tt.price),
      totalQty: String(tt.totalQty),
      maxPerUser: String(tt.maxPerUser),
      saleStartsAt: tt.saleStartsAt.slice(0, 16),
    });
    setActiveTab('tickets');
  };

  const handleSaveTt = async () => {
    const { name, price, totalQty, maxPerUser, saleStartsAt } = ttForm;
    if (!name || !price || !totalQty || !maxPerUser || !saleStartsAt) {
      setTtError('Vui lòng điền đầy đủ tất cả các trường.'); return;
    }
    setIsSavingTt(true); setTtError(''); setTtSuccess('');
    try {
      if (editTt) {
        await apiClient.patch(`/admin/ticket-types/${editTt.id}`,
          { name, price: Number(price), totalQty: Number(totalQty), maxPerUser: Number(maxPerUser), saleStartsAt: new Date(saleStartsAt).toISOString() },
          { headers: authHeader });
        setTtSuccess(`Đã cập nhật hạng vé "${name}"`);
      } else {
        await apiClient.post(`/admin/ticket-types`,
          { concertId: id, name, price: Number(price), totalQty: Number(totalQty), maxPerUser: Number(maxPerUser), saleStartsAt: new Date(saleStartsAt).toISOString() },
          { headers: authHeader });
        setTtSuccess(`Đã tạo hạng vé "${name}"`);
      }
      resetTtForm();
      await Promise.all([fetchConcert(), fetchStats()]);
    } catch (err: any) {
      const msg = err.response?.data?.message;
      setTtError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Lỗi lưu hạng vé.'));
    } finally { setIsSavingTt(false); }
  };

  const handleDeleteTt = async (tt: TicketType) => {
    if (!confirm(`Xóa hạng vé "${tt.name}"? Chỉ xóa được nếu chưa có vé nào bán.`)) return;
    try {
      await apiClient.delete(`/admin/ticket-types/${tt.id}`, { headers: authHeader });
      await Promise.all([fetchConcert(), fetchStats()]);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Không thể xóa hạng vé này.');
    }
  };

  // ── Edit Concert Info handler ─────────────────────────────────────────────

  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsUploadingImage(true);
    try {
      const res = await apiClient.post('/admin/upload/image', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      const imageUrl = `${import.meta.env.VITE_API_URL}${res.data.imageUrl}`;
      setEditForm((prev) => ({ ...prev, imageUrl }));
    } catch (err: any) {
      alert('Lỗi khi tải ảnh lên: ' + (err.response?.data?.message || err.message));
    } finally {
      setIsUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleUpdateConcert = async () => {
    if (!editForm.title || !editForm.venue || !editForm.startsAt || !editForm.slug) {
      setInfoError('Vui lòng điền đầy đủ tất cả các trường bắt buộc.'); return;
    }
    setIsSavingInfo(true); setInfoError(''); setInfoSuccess('');
    try {
      await apiClient.patch(
        `/admin/concerts/${id}`,
        {
          title: editForm.title,
          venue: editForm.venue,
          startsAt: new Date(editForm.startsAt).toISOString(),
          slug: editForm.slug,
          status: editForm.status,
          imageUrl: editForm.imageUrl || undefined,
        },
        { headers: authHeader }
      );
      setInfoSuccess('Đã cập nhật thông tin concert thành công!');
      await fetchConcert();
    } catch (err: any) {
      const msg = err.response?.data?.message;
      if (err.response?.status === 409) setInfoError('Slug này đã tồn tại. Hãy dùng slug khác.');
      else setInfoError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Lỗi cập nhật.'));
    } finally { setIsSavingInfo(false); }
  };

  // ── AI Bio handlers ───────────────────────────────────────────────────────

  const handleBioDrop = (e: React.DragEvent) => {
    e.preventDefault(); setBioDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === 'application/pdf') { setPdfFile(f); setBioError(''); }
    else setBioError('Chỉ chấp nhận file PDF.');
  };

  const handleUploadBio = async () => {
    if (!pdfFile) { setBioError('Vui lòng chọn file PDF.'); return; }
    setIsUploadingBio(true); setBioError('');
    const fd = new FormData(); fd.append('pdf', pdfFile);
    try {
      await apiClient.post(`/concerts/${id}/bio`, fd, {
        headers: { ...authHeader, 'Content-Type': 'multipart/form-data' },
      });
      setPdfFile(null);
      await fetchConcert(); // refresh để hiện bio mới
    } catch (err: any) {
      setBioError(err.response?.data?.message || 'Lỗi upload PDF.');
    } finally { setIsUploadingBio(false); }
  };

  // ── CSV handlers ──────────────────────────────────────────────────────────

  const handleCsvDrop = (e: React.DragEvent) => {
    e.preventDefault(); setCsvDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.csv') || f.type === 'text/csv')) { setCsvFile(f); setCsvError(''); }
    else setCsvError('Chỉ chấp nhận file CSV.');
  };

  const startBatchPolling = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      await fetchBatches();
      await fetchGuests();
    }, 2000);
    setTimeout(() => { if (pollingRef.current) clearInterval(pollingRef.current); }, 30000);
  };

  const handleUploadCsv = async () => {
    if (!csvFile) { setCsvError('Vui lòng chọn file CSV.'); return; }
    setIsUploadingCsv(true); setCsvError('');
    const fd = new FormData(); fd.append('file', csvFile);
    try {
      await apiClient.post(`/admin/concerts/${id}/guests/upload`, fd, {
        headers: { ...authHeader, 'Content-Type': 'multipart/form-data' },
      });
      setCsvFile(null);
      startBatchPolling();
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 409) setCsvError('File này đã được import rồi (checksum trùng). Hãy dùng file khác.');
      else setCsvError(err.response?.data?.message || 'Lỗi upload CSV.');
    } finally { setIsUploadingCsv(false); }
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  if (loading) return (
    <div className="empty-state">
      <div className="spinner" style={{ margin: '0 auto 12px' }} />
      Đang tải...
    </div>
  );
  if (!concert) return null;

  const soldTotal = stats?.ticketTypes.reduce((sum, ticketType) => sum + ticketType.soldQty, 0) ?? 0;
  const revenueTotal = stats?.totalRevenue ?? 0;
  const statsByTicketType = new Map(stats?.ticketTypes.map(ticketType => [ticketType.id, ticketType]) ?? []);

  const TabBtn = ({ tab, label }: { tab: typeof activeTab; label: string }) => (
    <button
      className={`tab${activeTab === tab ? ' active' : ''}`}
      onClick={() => { setActiveTab(tab); resetTtForm(); }}
    >{label}</button>
  );

  return (
    <div>
      <Link to="/admin/concerts" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 600, fontSize: 14, marginBottom: 20 }}>
        <ChevronLeft size={16} /> Sự kiện
      </Link>

      {/* ── Concert Header Card ── */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h1 style={{ fontSize: 24 }}>{concert.title}</h1>
              <span className={statusBadgeClass(concert.status)}>{concert.status}</span>
            </div>
            <p style={{ color: 'var(--text-2)' }}>
              {concert.venue} &nbsp;·&nbsp; {new Date(concert.startsAt).toLocaleString('vi-VN')}
            </p>
            <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>ID: {concert.id}</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="stat-card" style={{ minWidth: 120, alignItems: 'center', textAlign: 'center' }}>
              <span className="stat-value">{soldTotal}</span>
              <span className="stat-label">Vé đã bán</span>
            </div>
            <div className="stat-card" style={{ minWidth: 140, alignItems: 'center', textAlign: 'center' }}>
              <span className="stat-value">{revenueTotal.toLocaleString('vi-VN')}</span>
              <span className="stat-label">Doanh thu (VNĐ)</span>
            </div>
            <div className="stat-card" style={{ minWidth: 120, alignItems: 'center', textAlign: 'center' }}>
              <span className="stat-value">{batches.length}</span>
              <span className="stat-label">CSV Imports</span>
            </div>
          </div>
        </div>
      </div>

      <div className="tabs">
        <TabBtn tab="info" label="Thông tin" />
        <TabBtn tab="tickets" label="Hạng vé" />
        <TabBtn tab="bio" label="AI Artist Bio" />
        <TabBtn tab="guests" label="Guest List (CSV)" />
      </div>

      <div className="card card-body">

        {/* ══════════════ TAB: EDIT INFO ══════════════ */}
        {activeTab === 'info' && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>Chỉnh sửa thông tin Concert</h2>

            {infoError && <div className="alert alert-danger" style={{ marginBottom: 20 }}>{infoError}</div>}
            {infoSuccess && <div className="alert alert-success" style={{ marginBottom: 20 }}>{infoSuccess}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <div className="field">
                <label className="label">Tên concert *</label>
                <input className="input" placeholder="Tên concert" value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Địa điểm *</label>
                <input className="input" placeholder="Địa điểm tổ chức" value={editForm.venue} onChange={e => setEditForm(p => ({ ...p, venue: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Ngày & Giờ *</label>
                <input className="input" type="datetime-local" value={editForm.startsAt} onChange={e => setEditForm(p => ({ ...p, startsAt: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Slug *</label>
                <input className="input" placeholder="vd: blackpink-tour-2026" value={editForm.slug} onChange={e => setEditForm(p => ({ ...p, slug: e.target.value }))} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="label">Ảnh bìa (Tải lên hoặc dán Link)</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input className="input" placeholder="VD: https://images.unsplash.com/photo-xxx" value={editForm.imageUrl} onChange={e => setEditForm(p => ({ ...p, imageUrl: e.target.value }))} />
                  <label className="btn btn-secondary btn-sm" style={{ cursor: isUploadingImage ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                    {isUploadingImage ? 'Đang tải...' : 'Browse...'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={isUploadingImage} />
                  </label>
                </div>
                {editForm.imageUrl && (
                  <img src={editForm.imageUrl} alt="Preview" style={{ height: 100, borderRadius: 8, objectFit: 'cover', marginTop: 10 }} />
                )}
              </div>
              <div className="field">
                <label className="label">Trạng thái *</label>
                <select className="select" value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}>
                  <option value="ON_SALE">ON_SALE — Công khai với khán giả</option>
                  <option value="DRAFT">DRAFT — Ẩn (chưa công bố)</option>
                  <option value="SOLD_OUT">SOLD_OUT — Hết vé</option>
                  <option value="CANCELLED">CANCELLED — Đã hủy</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={handleUpdateConcert} disabled={isSavingInfo}>
                {isSavingInfo ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (!concert) return;
                  setEditForm({ title: concert.title, venue: concert.venue, startsAt: concert.startsAt.slice(0, 16), slug: concert.slug, status: concert.status, imageUrl: concert.imageUrl || '' });
                  setInfoError(''); setInfoSuccess('');
                }}
              >
                Khôi phục
              </button>
            </div>

            {/* Danger zone */}
            <div style={{ marginTop: 40, padding: 20, border: '1.5px solid var(--danger-border)', borderRadius: 'var(--radius-lg)', background: 'var(--danger-bg)' }}>
              <h3 style={{ color: 'var(--danger)', fontSize: 16, marginBottom: 8 }}>Vùng nguy hiểm</h3>
              <p style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 14 }}>
                Hủy concert sẽ void toàn bộ vé VALID và gửi thông báo đến người mua. Không thể hoàn tác.
              </p>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (!confirm(`Hủy concert "${concert?.title}"? Hành động này KHÔNG THỂ hoàn tác.`)) return;
                  try {
                    await apiClient.post(`/admin/concerts/${id}/cancel`, {}, { headers: authHeader });
                    navigate('/admin/concerts');
                  } catch (err: any) {
                    alert(err.response?.data?.message || 'Không thể hủy concert.');
                  }
                }}
              >
                Hủy Concert
              </button>
            </div>
          </div>
        )}

        {/* ══════════════ TAB: TICKET TYPES ══════════════ */}
        {activeTab === 'tickets' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18 }}>Quản lý Hạng vé</h2>
              {editTt && (
                <button className="btn btn-ghost btn-sm" onClick={resetTtForm}>✕ Hủy chỉnh sửa</button>
              )}
            </div>

            {/* Form */}
            <div className="card" style={{ padding: 20, marginBottom: 24, background: editTt ? 'var(--warning-bg)' : 'var(--surface-2)', borderColor: editTt ? 'var(--warning-border)' : 'var(--border)' }}>
              <h3 style={{ fontSize: 15, marginBottom: 16 }}>
                {editTt ? `Chỉnh sửa: ${editTt.name}` : 'Thêm hạng vé mới'}
              </h3>

              {ttError && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{ttError}</div>}
              {ttSuccess && <div className="alert alert-success" style={{ marginBottom: 14 }}>{ttSuccess}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Tên hạng vé *</label>
                  <input className="input" placeholder="VD: VIP, GA, CAT1..." value={ttForm.name} onChange={e => setTtForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Giá (VNĐ) *</label>
                  <input className="input" type="number" min="0" placeholder="VD: 500000" value={ttForm.price} onChange={e => setTtForm(p => ({ ...p, price: e.target.value }))} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Tổng số lượng *</label>
                  <input className="input" type="number" min="1" placeholder="VD: 500" value={ttForm.totalQty} onChange={e => setTtForm(p => ({ ...p, totalQty: e.target.value }))} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Giới hạn/người *</label>
                  <input className="input" type="number" min="1" placeholder="VD: 4" value={ttForm.maxPerUser} onChange={e => setTtForm(p => ({ ...p, maxPerUser: e.target.value }))} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Bắt đầu bán *</label>
                  <input className="input" type="datetime-local" value={ttForm.saleStartsAt} onChange={e => setTtForm(p => ({ ...p, saleStartsAt: e.target.value }))} />
                </div>
              </div>

              <button className="btn btn-primary" onClick={handleSaveTt} disabled={isSavingTt} style={{ marginTop: 14 }}>
                {isSavingTt ? 'Đang lưu...' : (editTt ? 'Cập nhật hạng vé' : 'Thêm hạng vé')}
              </button>
            </div>

            {/* Table */}
            {concert.ticketTypes.length === 0 ? (
              <div className="empty-state">Chưa có hạng vé nào. Thêm hạng vé bên trên.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {['Hạng vé', 'Giá', 'Tổng', 'Còn lại', 'Đã bán', 'Giới hạn', 'Bán từ', ''].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {concert.ticketTypes.map(tt => {
                      const sold = statsByTicketType.get(tt.id)?.soldQty ?? 0;
                      const pct = tt.totalQty > 0 ? Math.round(sold / tt.totalQty * 100) : 0;
                      return (
                        <tr key={tt.id} style={{ background: editTt?.id === tt.id ? 'var(--warning-bg)' : undefined }}>
                          <td style={{ fontWeight: 700 }}>{tt.name}</td>
                          <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{tt.price.toLocaleString('vi-VN')}</td>
                          <td>{tt.totalQty}</td>
                          <td>
                            <span style={{ color: tt.remainingQty === 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{tt.remainingQty}</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 600 }}>{sold}</span>
                              <div className="progress" style={{ width: 60 }}>
                                <div className="progress-bar" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--danger)' : 'var(--primary)' }} />
                              </div>
                              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{pct}%</span>
                            </div>
                          </td>
                          <td>{tt.maxPerUser}/người</td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 13, color: 'var(--text-2)' }}>{new Date(tt.saleStartsAt).toLocaleDateString('vi-VN')}</td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEditTt(tt)} style={{ marginRight: 6 }}>Sửa</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTt(tt)}>Xóa</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ TAB: AI BIO ══════════════ */}
        {activeTab === 'bio' && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>AI Artist Bio</h2>

            {/* Current bio */}
            {concert.artistBio ? (
              <div className="card" style={{ marginBottom: 28, padding: '20px 24px', background: 'var(--primary-soft)', borderLeft: '4px solid var(--accent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bio hiện tại</span>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => navigator.clipboard.writeText(concert.artistBio!)}
                  >Copy</button>
                </div>
                <p style={{ color: 'var(--text)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{concert.artistBio}</p>
              </div>
            ) : (
              <div className="empty-state" style={{ marginBottom: 24, border: '1.5px dashed var(--border-strong)', borderRadius: 'var(--radius-lg)' }}>
                Chưa có AI Artist Bio. Upload press-kit PDF để tạo.
              </div>
            )}

            {/* Upload zone */}
            <div className="card card-body">
              <h3 style={{ fontSize: 15, marginBottom: 16 }}>
                {concert.artistBio ? 'Tạo lại Bio (upload PDF mới)' : 'Upload Press-kit PDF'}
              </h3>

              <div
                onDragOver={e => { e.preventDefault(); setBioDragOver(true); }}
                onDragLeave={() => setBioDragOver(false)}
                onDrop={handleBioDrop}
                onClick={() => document.getElementById('bio-pdf-input')?.click()}
                style={{
                  border: `2px dashed ${bioDragOver ? 'var(--accent)' : pdfFile ? 'var(--success)' : 'var(--border-strong)'}`,
                  borderRadius: 'var(--radius-md)', padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
                  background: bioDragOver ? 'var(--primary-soft)' : pdfFile ? 'var(--success-bg)' : 'var(--surface-2)',
                  marginBottom: 16,
                }}
              >
                <input id="bio-pdf-input" type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f?.type === 'application/pdf') { setPdfFile(f); setBioError(''); } else if (f) setBioError('Chỉ nhận PDF.'); }} />
                {pdfFile ? (
                  <><div style={{ fontWeight: 700, color: 'var(--success)' }}>{pdfFile.name}</div><div style={{ color: 'var(--text-2)', fontSize: 13 }}>{(pdfFile.size / 1024).toFixed(1)} KB</div></>
                ) : (
                  <><div style={{ fontWeight: 600 }}>Kéo thả PDF hoặc bấm để chọn</div><div style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>Chỉ nhận PDF · Tối đa 20MB</div></>
                )}
              </div>

              {bioError && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{bioError}</div>}

              <button className="btn btn-primary" onClick={handleUploadBio} disabled={isUploadingBio || !pdfFile}>
                {isUploadingBio ? 'AI đang phân tích...' : 'Tạo Bio bằng AI'}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════ TAB: GUEST LIST ══════════════ */}
        {activeTab === 'guests' && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>Guest List — CSV Import</h2>

            {/* Upload zone */}
            <div className="card card-body" style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 15, marginBottom: 14 }}>Import CSV mới</h3>

              <div className="alert alert-info" style={{ marginBottom: 14 }}>
                <strong>Files demo:</strong> <code>guests-valid.csv</code> · <code>guests-with-errors.csv</code> · <code>guests-duplicates.csv</code>
              </div>

              <div
                onDragOver={e => { e.preventDefault(); setCsvDragOver(true); }}
                onDragLeave={() => setCsvDragOver(false)}
                onDrop={handleCsvDrop}
                onClick={() => document.getElementById('guest-csv-input')?.click()}
                style={{
                  border: `2px dashed ${csvDragOver ? 'var(--info)' : csvFile ? 'var(--success)' : 'var(--border-strong)'}`,
                  borderRadius: 'var(--radius-md)', padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
                  background: csvDragOver ? 'var(--info-bg)' : csvFile ? 'var(--success-bg)' : 'var(--surface-2)',
                  marginBottom: 14,
                }}
              >
                <input id="guest-csv-input" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f && (f.name.endsWith('.csv') || f.type === 'text/csv')) { setCsvFile(f); setCsvError(''); } else if (f) setCsvError('Chỉ nhận CSV.'); }} />
                {csvFile ? (
                  <><div style={{ fontWeight: 700, color: 'var(--success)' }}>{csvFile.name}</div><div style={{ color: 'var(--text-2)', fontSize: 13 }}>{(csvFile.size / 1024).toFixed(1)} KB</div></>
                ) : (
                  <div style={{ fontWeight: 600 }}>Kéo thả CSV hoặc bấm để chọn</div>
                )}
              </div>

              {csvError && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{csvError}</div>}

              <button className="btn btn-primary" onClick={handleUploadCsv} disabled={isUploadingCsv || !csvFile}>
                {isUploadingCsv ? 'Đang gửi...' : 'Import CSV'}
              </button>
            </div>

            {/* Batch history */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ fontSize: 15 }}>Lịch sử Import</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => { fetchBatches(); fetchGuests(); }}>Refresh</button>
              </div>

              {batches.length === 0 ? (
                <div className="empty-state">Chưa có batch import nào.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {batches.map(b => {
                    const badgeCls =
                      b.status === 'SUCCESS' ? 'badge badge-success' :
                        b.status === 'FAILED' ? 'badge badge-danger' :
                          b.status === 'PROCESSING' ? 'badge badge-warning' : 'badge badge-muted';
                    return (
                      <div key={b.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <div style={{ fontWeight: 600 }}>{b.filename}</div>
                          <div style={{ color: 'var(--text-3)', fontSize: 12 }}>{new Date(b.createdAt).toLocaleString('vi-VN')}</div>
                        </div>
                        <span className={badgeCls}>{b.status}</span>
                        <div style={{ display: 'flex', gap: 12, fontSize: 13, fontWeight: 600 }}>
                          <span>{b.rowsTotal} dòng</span>
                          <span style={{ color: 'var(--success)' }}>{b.rowsOk}</span>
                          <span style={{ color: 'var(--danger)' }}>{b.rowsFailed}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Current Guest List */}
            <div style={{ marginTop: 40 }}>
              <h3 style={{ fontSize: 15, marginBottom: 14 }}>Danh sách Khách mời ({guests.length})</h3>

              {guests.length === 0 ? (
                <div className="empty-state">Chưa có khách mời nào.</div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Tên (fullName)</th>
                        <th>Căn cước (docId)</th>
                        <th>Khu vực (zone)</th>
                        <th style={{ textAlign: 'center' }}>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guests.map(g => (
                        <tr key={g.id}>
                          <td style={{ fontWeight: 500 }}>{g.fullName}</td>
                          <td style={{ color: 'var(--text-2)' }}>{g.docId || '-'}</td>
                          <td style={{ color: 'var(--text-2)' }}>{g.zone || '-'}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={g.status === 'CHECKED_IN' ? 'badge badge-success' : 'badge badge-warning'}>
                              {g.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
