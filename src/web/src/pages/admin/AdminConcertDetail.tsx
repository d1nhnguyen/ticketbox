import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
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
  ticketTypes: TicketType[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const API = 'http://localhost:3000';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: '8px',
  border: '1.5px solid #d1d5db', fontSize: '0.9rem', outline: 'none',
  boxSizing: 'border-box', background: '#fafafa', color: '#111827',
};

const badgeStyle = (color: string, bg: string, border: string): React.CSSProperties => ({
  display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
  fontSize: '0.78rem', fontWeight: 600, color, background: bg, border: `1px solid ${border}`,
});

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminConcertDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const authHeader = { Authorization: `Bearer ${token}` };

  // Concert state
  const [concert, setConcert] = useState<Concert | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tickets' | 'bio' | 'guests' | 'info'>('tickets');

  // ── Edit Concert Info ─────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState({ title: '', venue: '', startsAt: '', slug: '', status: '' });
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
      const res = await axios.get(`${API}/admin/concerts/${id}`, { headers: authHeader });
      setConcert(res.data);
      // Sync edit form whenever concert data refreshes
      setEditForm({
        title: res.data.title,
        venue: res.data.venue,
        startsAt: res.data.startsAt ? res.data.startsAt.slice(0, 16) : '',
        slug: res.data.slug,
        status: res.data.status,
      });
    } catch {
      navigate('/admin');
    } finally {
      setLoading(false);
    }
  };

  const fetchBatches = async () => {
    try {
      const res = await axios.get(`${API}/admin/concerts/${id}/guests/batches`, { headers: authHeader });
      setBatches(res.data);
    } catch { /* silent */ }
  };

  const fetchGuests = async () => {
    try {
      const res = await axios.get(`${API}/admin/concerts/${id}/guests/list`, { headers: authHeader });
      setGuests(res.data);
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchConcert();
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
        await axios.patch(`${API}/admin/ticket-types/${editTt.id}`,
          { name, price: Number(price), totalQty: Number(totalQty), maxPerUser: Number(maxPerUser), saleStartsAt: new Date(saleStartsAt).toISOString() },
          { headers: authHeader });
        setTtSuccess(`✅ Đã cập nhật hạng vé "${name}"`);
      } else {
        await axios.post(`${API}/admin/ticket-types`,
          { concertId: id, name, price: Number(price), totalQty: Number(totalQty), maxPerUser: Number(maxPerUser), saleStartsAt: new Date(saleStartsAt).toISOString() },
          { headers: authHeader });
        setTtSuccess(`✅ Đã tạo hạng vé "${name}"`);
      }
      resetTtForm();
      await fetchConcert();
    } catch (err: any) {
      const msg = err.response?.data?.message;
      setTtError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Lỗi lưu hạng vé.'));
    } finally { setIsSavingTt(false); }
  };

  const handleDeleteTt = async (tt: TicketType) => {
    if (!confirm(`Xóa hạng vé "${tt.name}"? Chỉ xóa được nếu chưa có vé nào bán.`)) return;
    try {
      await axios.delete(`${API}/admin/ticket-types/${tt.id}`, { headers: authHeader });
      await fetchConcert();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Không thể xóa hạng vé này.');
    }
  };

  // ── Edit Concert Info handler ─────────────────────────────────────────────

  const handleUpdateConcert = async () => {
    if (!editForm.title || !editForm.venue || !editForm.startsAt || !editForm.slug) {
      setInfoError('Vui lòng điền đầy đủ tất cả các trường bắt buộc.'); return;
    }
    setIsSavingInfo(true); setInfoError(''); setInfoSuccess('');
    try {
      await axios.patch(
        `${API}/admin/concerts/${id}`,
        {
          title: editForm.title,
          venue: editForm.venue,
          startsAt: new Date(editForm.startsAt).toISOString(),
          slug: editForm.slug,
          status: editForm.status,
        },
        { headers: authHeader }
      );
      setInfoSuccess('✅ Đã cập nhật thông tin concert thành công!');
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
      await axios.post(`${API}/concerts/${id}/bio`, fd, {
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
      await axios.post(`${API}/admin/concerts/${id}/guests/upload`, fd, {
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
    <div style={{ padding: '80px', textAlign: 'center', color: '#6b7280', fontSize: '1.1rem' }}>
      ⏳ Đang tải...
    </div>
  );
  if (!concert) return null;

  const soldTotal = concert.ticketTypes.reduce((s, t) => s + (t.totalQty - t.remainingQty), 0);
  const revenueTotal = concert.ticketTypes.reduce((s, t) => s + (t.totalQty - t.remainingQty) * t.price, 0);

  const statusColors: Record<string, [string, string, string]> = {
    ON_SALE: ['#059669', '#f0fdf4', '#bbf7d0'],
    DRAFT: ['#9ca3af', '#f9fafb', '#e5e7eb'],
    SOLD_OUT: ['#dc2626', '#fef2f2', '#fecaca'],
    CANCELLED: ['#dc2626', '#fef2f2', '#fecaca'],
  };
  const [sc, sbg, sbd] = statusColors[concert.status] ?? ['#9ca3af', '#f9fafb', '#e5e7eb'];

  const TabBtn = ({ tab, label }: { tab: typeof activeTab; label: string }) => (
    <button
      onClick={() => { setActiveTab(tab); resetTtForm(); }}
      style={{
        padding: '10px 22px', border: 'none', cursor: 'pointer', fontWeight: 600,
        fontSize: '0.9rem', borderRadius: '8px 8px 0 0', transition: 'all 0.15s',
        background: activeTab === tab ? 'white' : 'transparent',
        color: activeTab === tab ? '#111827' : '#6b7280',
        borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
      }}
    >{label}</button>
  );

  return (
    <div style={{ maxWidth: '1100px', margin: '36px auto', padding: '0 20px' }}>

      {/* ── Breadcrumb ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', fontSize: '0.9rem', color: '#6b7280' }}>
        <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontWeight: 600, padding: 0 }}>
          ← Dashboard
        </button>
        <span>/</span>
        <span style={{ color: '#111827', fontWeight: 600 }}>{concert.title}</span>
      </div>

      {/* ── Concert Header Card ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: '16px', padding: '28px 32px', color: 'white', marginBottom: '28px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800 }}>{concert.title}</h1>
              <span style={badgeStyle(sc, sbg, sbd)}>{concert.status}</span>
            </div>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '1rem' }}>
              📍 {concert.venue} &nbsp;·&nbsp; ⏰ {new Date(concert.startsAt).toLocaleString('vi-VN')}
            </p>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.82rem' }}>ID: {concert.id}</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#38bdf8' }}>{soldTotal}</div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>Vé đã bán</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#34d399' }}>{revenueTotal.toLocaleString('vi-VN')}</div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>Doanh thu (VNĐ)</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#a78bfa' }}>{batches.length}</div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>CSV Imports</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ borderBottom: '1px solid #e5e7eb', marginBottom: '0', display: 'flex', gap: '4px' }}>
        <TabBtn tab="info" label="✏️ Thông tin" />
        <TabBtn tab="tickets" label="🎟️ Hạng vé" />
        <TabBtn tab="bio" label="🤖 AI Artist Bio" />
        <TabBtn tab="guests" label="📋 Guest List (CSV)" />
      </div>

      <div style={{ background: 'white', borderRadius: '0 0 16px 16px', border: '1px solid #e5e7eb', borderTop: 'none', padding: '28px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>

        {/* ══════════════ TAB: EDIT INFO ══════════════ */}
        {activeTab === 'info' && (
          <div>
            <h2 style={{ margin: '0 0 24px', fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>✏️ Chỉnh sửa thông tin Concert</h2>

            {infoError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', color: '#dc2626', marginBottom: '20px', fontSize: '0.9rem' }}>
                ⚠️ {infoError}
              </div>
            )}
            {infoSuccess && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 16px', color: '#059669', marginBottom: '20px', fontSize: '0.9rem' }}>
                {infoSuccess}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '6px' }}>Tên concert *</label>
                <input
                  style={inputStyle}
                  placeholder="Tên concert"
                  value={editForm.title}
                  onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '6px' }}>Địa điểm *</label>
                <input
                  style={inputStyle}
                  placeholder="Địa điểm tổ chức"
                  value={editForm.venue}
                  onChange={e => setEditForm(p => ({ ...p, venue: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '6px' }}>Ngày & Giờ *</label>
                <input
                  style={inputStyle}
                  type="datetime-local"
                  value={editForm.startsAt}
                  onChange={e => setEditForm(p => ({ ...p, startsAt: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '6px' }}>Slug *</label>
                <input
                  style={{ ...inputStyle, color: '#6b7280' }}
                  placeholder="vd: blackpink-tour-2026"
                  value={editForm.slug}
                  onChange={e => setEditForm(p => ({ ...p, slug: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '6px' }}>Trạng thái *</label>
                <select
                  style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }}
                  value={editForm.status}
                  onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                >
                  <option value="ON_SALE">🟢 ON_SALE — Công khai với khán giả</option>
                  <option value="DRAFT">⬜ DRAFT — Ẩn (chưa công bố)</option>
                  <option value="SOLD_OUT">🔴 SOLD_OUT — Hết vé</option>
                  <option value="CANCELLED">❌ CANCELLED — Đã hủy</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                onClick={handleUpdateConcert}
                disabled={isSavingInfo}
                style={{
                  padding: '11px 28px', border: 'none', borderRadius: '9px', fontWeight: 700, fontSize: '0.95rem',
                  cursor: isSavingInfo ? 'not-allowed' : 'pointer',
                  background: isSavingInfo ? '#e5e7eb' : '#3b82f6',
                  color: isSavingInfo ? '#9ca3af' : 'white',
                }}
              >
                {isSavingInfo ? '⏳ Đang lưu...' : '💾 Lưu thay đổi'}
              </button>
              <button
                onClick={() => {
                  if (!concert) return;
                  setEditForm({ title: concert.title, venue: concert.venue, startsAt: concert.startsAt.slice(0, 16), slug: concert.slug, status: concert.status });
                  setInfoError(''); setInfoSuccess('');
                }}
                style={{ padding: '11px 20px', border: '1.5px solid #d1d5db', borderRadius: '9px', background: 'white', color: '#6b7280', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}
              >
                ↺ Khôi phục
              </button>
            </div>

            {/* Danger zone */}
            <div style={{ marginTop: '40px', padding: '20px', border: '1.5px solid #fecaca', borderRadius: '12px', background: '#fff5f5' }}>
              <h3 style={{ margin: '0 0 8px', color: '#dc2626', fontSize: '1rem', fontWeight: 700 }}>⚠️ Vùng nguy hiểm</h3>
              <p style={{ margin: '0 0 14px', color: '#9b1c1c', fontSize: '0.88rem' }}>
                Hủy concert sẽ void toàn bộ vé VALID và gửi thông báo đến người mua. Không thể hoàn tác.
              </p>
              <button
                onClick={async () => {
                  if (!confirm(`Hủy concert "${concert?.title}"? Hành động này KHÔNG THỂ hoàn tác.`)) return;
                  try {
                    await axios.post(`${API}/admin/concerts/${id}/cancel`, {}, { headers: authHeader });
                    navigate('/admin');
                  } catch (err: any) {
                    alert(err.response?.data?.message || 'Không thể hủy concert.');
                  }
                }}
                style={{ padding: '10px 22px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}
              >
                🚫 Hủy Concert
              </button>
            </div>
          </div>
        )}

        {/* ══════════════ TAB: TICKET TYPES ══════════════ */}
        {activeTab === 'tickets' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>
                Quản lý Hạng vé
              </h2>
              {editTt && (
                <button onClick={resetTtForm} style={{ background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  ✕ Hủy chỉnh sửa
                </button>
              )}
            </div>

            {/* Form */}
            <div style={{ background: editTt ? '#fffbeb' : '#f8fafc', border: `1.5px solid ${editTt ? '#fde68a' : '#e2e8f0'}`, borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#374151' }}>
                {editTt ? `✏️ Chỉnh sửa: ${editTt.name}` : '➕ Thêm hạng vé mới'}
              </h3>

              {ttError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', marginBottom: '14px', fontSize: '0.9rem' }}>⚠️ {ttError}</div>}
              {ttSuccess && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', color: '#059669', marginBottom: '14px', fontSize: '0.9rem' }}>{ttSuccess}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#374151', marginBottom: '5px' }}>Tên hạng vé *</label>
                  <input style={inputStyle} placeholder="VD: VIP, GA, CAT1..." value={ttForm.name} onChange={e => setTtForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#374151', marginBottom: '5px' }}>Giá (VNĐ) *</label>
                  <input style={inputStyle} type="number" min="0" placeholder="VD: 500000" value={ttForm.price} onChange={e => setTtForm(p => ({ ...p, price: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#374151', marginBottom: '5px' }}>Tổng số lượng *</label>
                  <input style={inputStyle} type="number" min="1" placeholder="VD: 500" value={ttForm.totalQty} onChange={e => setTtForm(p => ({ ...p, totalQty: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#374151', marginBottom: '5px' }}>Giới hạn/người *</label>
                  <input style={inputStyle} type="number" min="1" placeholder="VD: 4" value={ttForm.maxPerUser} onChange={e => setTtForm(p => ({ ...p, maxPerUser: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#374151', marginBottom: '5px' }}>Bắt đầu bán *</label>
                  <input style={inputStyle} type="datetime-local" value={ttForm.saleStartsAt} onChange={e => setTtForm(p => ({ ...p, saleStartsAt: e.target.value }))} />
                </div>
              </div>

              <button
                onClick={handleSaveTt}
                disabled={isSavingTt}
                style={{
                  padding: '10px 24px', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: isSavingTt ? 'not-allowed' : 'pointer', fontSize: '0.9rem',
                  background: isSavingTt ? '#e5e7eb' : (editTt ? '#f59e0b' : '#10b981'),
                  color: isSavingTt ? '#9ca3af' : 'white',
                }}
              >
                {isSavingTt ? '⏳ Đang lưu...' : (editTt ? '💾 Cập nhật hạng vé' : '➕ Thêm hạng vé')}
              </button>
            </div>

            {/* Table */}
            {concert.ticketTypes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                Chưa có hạng vé nào. Thêm hạng vé bên trên.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      {['Hạng vé', 'Giá', 'Tổng', 'Còn lại', 'Đã bán', 'Giới hạn', 'Bán từ', ''].map(h => (
                        <th key={h} style={{ padding: '12px 14px', textAlign: 'left', color: '#374151', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {concert.ticketTypes.map(tt => {
                      const sold = tt.totalQty - tt.remainingQty;
                      const pct = tt.totalQty > 0 ? Math.round(sold / tt.totalQty * 100) : 0;
                      return (
                        <tr key={tt.id} style={{ borderBottom: '1px solid #f3f4f6', background: editTt?.id === tt.id ? '#fffbeb' : 'white' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#111827' }}>{tt.name}</td>
                          <td style={{ padding: '12px 14px', color: '#ef4444', fontWeight: 600 }}>{tt.price.toLocaleString('vi-VN')}</td>
                          <td style={{ padding: '12px 14px', color: '#4b5563' }}>{tt.totalQty}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ color: tt.remainingQty === 0 ? '#dc2626' : '#059669', fontWeight: 600 }}>{tt.remainingQty}</span>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 600, color: '#374151' }}>{sold}</span>
                              <div style={{ width: '60px', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#ef4444' : '#3b82f6', borderRadius: '3px' }} />
                              </div>
                              <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{pct}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', color: '#4b5563' }}>{tt.maxPerUser}/người</td>
                          <td style={{ padding: '12px 14px', color: '#6b7280', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{new Date(tt.saleStartsAt).toLocaleDateString('vi-VN')}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button onClick={() => openEditTt(tt)} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', marginRight: '6px', fontSize: '0.82rem', fontWeight: 500 }}>✏️ Sửa</button>
                            <button onClick={() => handleDeleteTt(tt)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500 }}>🗑️ Xóa</button>
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
            <h2 style={{ margin: '0 0 20px', fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>🤖 AI Artist Bio</h2>

            {/* Current bio */}
            {concert.artistBio ? (
              <div style={{ marginBottom: '28px', background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '1px solid #c4b5fd', borderLeft: '4px solid #7c3aed', borderRadius: '12px', padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span>🤖</span>
                  <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bio hiện tại</span>
                  <span style={{ marginLeft: 'auto', cursor: 'pointer', color: '#7c3aed', fontSize: '0.82rem', fontWeight: 600, border: '1px solid #c4b5fd', borderRadius: '6px', padding: '3px 10px', background: 'white' }}
                    onClick={() => navigator.clipboard.writeText(concert.artistBio!)}>📋 Copy</span>
                </div>
                <p style={{ color: '#3730a3', lineHeight: 1.8, margin: 0, fontSize: '0.97rem', whiteSpace: 'pre-wrap' }}>{concert.artistBio}</p>
              </div>
            ) : (
              <div style={{ marginBottom: '24px', background: '#f9fafb', border: '1.5px dashed #d1d5db', borderRadius: '12px', padding: '24px', textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🤖</div>
                <p style={{ margin: 0, fontWeight: 500 }}>Chưa có AI Artist Bio. Upload press-kit PDF để tạo.</p>
              </div>
            )}

            {/* Upload zone */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#374151' }}>
                {concert.artistBio ? '🔄 Tạo lại Bio (upload PDF mới)' : '📄 Upload Press-kit PDF'}
              </h3>

              <div
                onDragOver={e => { e.preventDefault(); setBioDragOver(true); }}
                onDragLeave={() => setBioDragOver(false)}
                onDrop={handleBioDrop}
                onClick={() => document.getElementById('bio-pdf-input')?.click()}
                style={{
                  border: `2px dashed ${bioDragOver ? '#7c3aed' : pdfFile ? '#10b981' : '#d1d5db'}`,
                  borderRadius: '10px', padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
                  background: bioDragOver ? '#f5f3ff' : pdfFile ? '#f0fdf4' : '#fafafa', transition: 'all 0.2s',
                  marginBottom: '16px',
                }}
              >
                <input id="bio-pdf-input" type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f?.type === 'application/pdf') { setPdfFile(f); setBioError(''); } else if (f) setBioError('Chỉ nhận PDF.'); }} />
                {pdfFile ? (
                  <><div style={{ fontSize: '2rem', marginBottom: '6px' }}>📑</div><div style={{ fontWeight: 700, color: '#059669' }}>{pdfFile.name}</div><div style={{ color: '#6b7280', fontSize: '0.82rem' }}>{(pdfFile.size / 1024).toFixed(1)} KB</div></>
                ) : (
                  <><div style={{ fontSize: '2rem', marginBottom: '6px' }}>☁️</div><div style={{ fontWeight: 600, color: '#374151' }}>Kéo thả PDF hoặc bấm để chọn</div><div style={{ color: '#9ca3af', fontSize: '0.82rem', marginTop: '4px' }}>Chỉ nhận PDF · Tối đa 20MB</div></>
                )}
              </div>

              {bioError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', marginBottom: '14px', fontSize: '0.9rem' }}>⚠️ {bioError}</div>}

              <button
                onClick={handleUploadBio}
                disabled={isUploadingBio || !pdfFile}
                style={{
                  padding: '12px 28px', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.95rem',
                  cursor: isUploadingBio || !pdfFile ? 'not-allowed' : 'pointer',
                  background: isUploadingBio || !pdfFile ? '#e5e7eb' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: isUploadingBio || !pdfFile ? '#9ca3af' : 'white',
                }}
              >
                {isUploadingBio ? '⏳ AI đang phân tích...' : '🚀 Tạo Bio bằng AI'}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════ TAB: GUEST LIST ══════════════ */}
        {activeTab === 'guests' && (
          <div>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>📋 Guest List — CSV Import</h2>

            {/* Upload zone */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '28px' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700, color: '#374151' }}>📤 Upload CSV mới</h3>

              <div style={{ background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', padding: '10px 14px', marginBottom: '14px', fontSize: '0.82rem', color: '#1e40af' }}>
                <strong>💡 Files demo:</strong> <code>guests-valid.csv</code> · <code>guests-with-errors.csv</code> · <code>guests-duplicates.csv</code>
              </div>

              <div
                onDragOver={e => { e.preventDefault(); setCsvDragOver(true); }}
                onDragLeave={() => setCsvDragOver(false)}
                onDrop={handleCsvDrop}
                onClick={() => document.getElementById('guest-csv-input')?.click()}
                style={{
                  border: `2px dashed ${csvDragOver ? '#0891b2' : csvFile ? '#10b981' : '#d1d5db'}`,
                  borderRadius: '10px', padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
                  background: csvDragOver ? '#f0f9ff' : csvFile ? '#f0fdf4' : '#fafafa', transition: 'all 0.2s',
                  marginBottom: '14px',
                }}
              >
                <input id="guest-csv-input" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f && (f.name.endsWith('.csv') || f.type === 'text/csv')) { setCsvFile(f); setCsvError(''); } else if (f) setCsvError('Chỉ nhận CSV.'); }} />
                {csvFile ? (
                  <><div style={{ fontSize: '2rem', marginBottom: '6px' }}>📊</div><div style={{ fontWeight: 700, color: '#059669' }}>{csvFile.name}</div><div style={{ color: '#6b7280', fontSize: '0.82rem' }}>{(csvFile.size / 1024).toFixed(1)} KB</div></>
                ) : (
                  <><div style={{ fontSize: '2rem', marginBottom: '6px' }}>☁️</div><div style={{ fontWeight: 600, color: '#374151' }}>Kéo thả CSV hoặc bấm để chọn</div></>
                )}
              </div>

              {csvError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', marginBottom: '12px', fontSize: '0.9rem' }}>⚠️ {csvError}</div>}

              <button
                onClick={handleUploadCsv}
                disabled={isUploadingCsv || !csvFile}
                style={{
                  padding: '11px 24px', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem',
                  cursor: isUploadingCsv || !csvFile ? 'not-allowed' : 'pointer',
                  background: isUploadingCsv || !csvFile ? '#e5e7eb' : 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                  color: isUploadingCsv || !csvFile ? '#9ca3af' : 'white',
                }}
              >
                {isUploadingCsv ? '⏳ Đang gửi...' : '📤 Import CSV'}
              </button>
            </div>

            {/* Batch history */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#374151' }}>📜 Lịch sử Import</h3>
                <button onClick={() => { fetchBatches(); fetchGuests(); }} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', color: '#4b5563', fontSize: '0.82rem' }}>🔄 Refresh</button>
              </div>

              {batches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', background: '#f9fafb', borderRadius: '10px', border: '1px solid #f3f4f6' }}>Chưa có batch import nào.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {batches.map(b => {
                    const statusMap: Record<string, [string, string, string, string]> = {
                      SUCCESS: ['✅', '#059669', '#f0fdf4', '#bbf7d0'],
                      FAILED: ['❌', '#dc2626', '#fef2f2', '#fecaca'],
                      PROCESSING: ['⏳', '#d97706', '#fffbeb', '#fde68a'],
                    };
                    const [icon, sc2, sbg2, sbd2] = statusMap[b.status] ?? ['❓', '#9ca3af', '#f9fafb', '#e5e7eb'];
                    return (
                      <div key={b.id} style={{ background: 'white', border: '1px solid #f3f4f6', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.2rem' }}>{icon}</span>
                        <div style={{ flex: 1, minWidth: '160px' }}>
                          <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.9rem' }}>{b.filename}</div>
                          <div style={{ color: '#9ca3af', fontSize: '0.78rem' }}>{new Date(b.createdAt).toLocaleString('vi-VN')}</div>
                        </div>
                        <span style={badgeStyle(sc2, sbg2, sbd2)}>{b.status}</span>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '0.82rem', fontWeight: 600 }}>
                          <span style={{ color: '#374151' }}>📊 {b.rowsTotal} dòng</span>
                          <span style={{ color: '#059669' }}>✅ {b.rowsOk}</span>
                          <span style={{ color: '#dc2626' }}>❌ {b.rowsFailed}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Current Guest List */}
            <div style={{ marginTop: '40px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#374151' }}>👥 Danh sách Khách mời ({guests.length})</h3>
              </div>

              {guests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', background: '#f9fafb', borderRadius: '10px', border: '1px solid #f3f4f6' }}>Chưa có khách mời nào.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '12px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Tên (fullName)</th>
                        <th style={{ padding: '12px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Căn cước (docId)</th>
                        <th style={{ padding: '12px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>Khu vực (zone)</th>
                        <th style={{ padding: '12px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guests.map(g => (
                        <tr key={g.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px', color: '#0f172a', fontWeight: 500 }}>{g.fullName}</td>
                          <td style={{ padding: '12px', color: '#64748b' }}>{g.docId || '-'}</td>
                          <td style={{ padding: '12px', color: '#64748b' }}>{g.zone || '-'}</td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <span style={badgeStyle(...(g.status === 'CHECKED_IN' ? ['#059669', '#f0fdf4', '#bbf7d0'] : ['#d97706', '#fffbeb', '#fde68a']) as [string, string, string])}>
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
