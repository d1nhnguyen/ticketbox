import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';

interface ConcertStats {
  totalRevenue: number;
  ticketTypes: Array<{ soldQty: number }>;
}

export default function Dashboard() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [concerts, setConcerts] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalRevenue: 0, totalTicketsSold: 0 });
  const [loading, setLoading] = useState(true);

  // Create concert form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    venue: '',
    startsAt: '',
    slug: '',
    status: 'ON_SALE',
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const fetchAdminData = async () => {
    try {
      const resConcerts = await axios.get('http://localhost:3000/admin/concerts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConcerts(resConcerts.data);

      const statsResponses = await Promise.all(
        resConcerts.data.map((concert: any) =>
          axios.get<ConcertStats>(
            `http://localhost:3000/admin/concerts/${concert.id}/stats`,
            { headers: { Authorization: `Bearer ${token}` } },
          ),
        ),
      );

      const revenue = statsResponses.reduce(
        (sum, response) => sum + response.data.totalRevenue,
        0,
      );
      const sold = statsResponses.reduce(
        (sum, response) =>
          sum + response.data.ticketTypes.reduce(
            (ticketSum: number, ticketType: { soldQty: number }) => ticketSum + ticketType.soldQty,
            0,
          ),
        0,
      );

      setStats({ totalRevenue: revenue, totalTicketsSold: sold });
    } catch (err) {
      console.error('Lỗi tải dữ liệu Admin:', err);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchAdminData();
  }, [token]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy sự kiện này? Hành động này không thể hoàn tác.')) return;

    try {
      await axios.delete(`http://localhost:3000/admin/concerts/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConcerts(concerts.filter((c) => c.id !== id));
      alert('Đã hủy sự kiện thành công!');
    } catch {
      alert('Lỗi khi hủy sự kiện. Vui lòng kiểm tra lại quyền hoặc thử lại sau.');
    }
  };

  // Auto-generate slug from title
  const handleTitleChange = (value: string) => {
    const slug = value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    setCreateForm((prev) => ({ ...prev, title: value, slug }));
  };

  const handleCreateSubmit = async () => {
    const { title, venue, startsAt, slug } = createForm;
    if (!title || !venue || !startsAt || !slug) {
      setCreateError('Vui lòng điền đầy đủ tất cả các trường.');
      return;
    }

    setIsCreating(true);
    setCreateError('');
    setCreateSuccess('');

    try {
      await axios.post(
        'http://localhost:3000/admin/concerts',
        { title, venue, startsAt: new Date(startsAt).toISOString(), slug, status: createForm.status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCreateSuccess(`✅ Đã tạo concert "${title}" thành công!`);
      setCreateForm({ title: '', venue: '', startsAt: '', slug: '', status: 'ON_SALE' });
      setShowCreateForm(false);
      await fetchAdminData(); // Refresh list
    } catch (err: any) {
      const msg = err.response?.data?.message;
      if (err.response?.status === 409) setCreateError('Slug này đã tồn tại. Hãy dùng slug khác.');
      else if (Array.isArray(msg)) setCreateError(msg.join(', '));
      else setCreateError(msg || 'Lỗi tạo concert. Vui lòng thử lại.');
    } finally {
      setIsCreating(false);
    }
  };

  if (loading)
    return (
      <div style={{ padding: '50px', textAlign: 'center', fontSize: '1.2rem', color: '#6b7280' }}>
        ⏳ Đang tải dữ liệu hệ thống...
      </div>
    );

  return (
    <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ color: '#111827', fontSize: '2rem', margin: 0 }}>⚙️ Admin Dashboard</h1>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/admin/csv-upload')}
            style={{
              background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
              color: 'white', padding: '10px 18px', border: 'none',
              borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem'
            }}
          >
            📋 Import CSV Khách mời
          </button>
          <button
            onClick={() => navigate('/admin/ai-bio')}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white', padding: '10px 18px', border: 'none',
              borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem'
            }}
          >
            🤖 AI Artist Bio
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{
              background: showCreateForm ? '#ef4444' : '#10b981',
              color: 'white', padding: '10px 18px', border: 'none',
              borderRadius: '8px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {showCreateForm ? '✕ Hủy' : '+ Tạo sự kiện mới'}
          </button>
        </div>
      </div>

      {/* Success banner */}
      {createSuccess && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px',
          padding: '12px 16px', color: '#166534', marginBottom: '20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span>{createSuccess}</span>
          <button
            onClick={() => setCreateSuccess('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: '1.1rem' }}
          >✕</button>
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '32px', flexWrap: 'wrap' }}>
        <div style={{
          flex: 1, minWidth: '200px', background: 'white', padding: '25px',
          borderRadius: '12px', border: '1px solid #e5e7eb',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ color: '#6b7280', fontSize: '1rem', marginBottom: '10px', fontWeight: 500 }}>
            💰 Tổng Doanh Thu (đã thanh toán)
          </h3>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981', margin: 0 }}>
            {stats.totalRevenue.toLocaleString('vi-VN')} VNĐ
          </p>
        </div>
        <div style={{
          flex: 1, minWidth: '200px', background: 'white', padding: '25px',
          borderRadius: '12px', border: '1px solid #e5e7eb',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ color: '#6b7280', fontSize: '1rem', marginBottom: '10px', fontWeight: 500 }}>
            🎟️ Tổng Số Vé Đã Bán
          </h3>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: '#3b82f6', margin: 0 }}>
            {stats.totalTicketsSold} vé
          </p>
        </div>
        <div style={{
          flex: 1, minWidth: '200px', background: 'white', padding: '25px',
          borderRadius: '12px', border: '1px solid #e5e7eb',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ color: '#6b7280', fontSize: '1rem', marginBottom: '10px', fontWeight: 500 }}>
            🎪 Tổng Sự Kiện
          </h3>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: '#8b5cf6', margin: 0 }}>
            {concerts.length} concert
          </p>
        </div>
      </div>

      {/* Create Concert Form */}
      {showCreateForm && (
        <div style={{
          background: 'white', padding: '28px', borderRadius: '16px',
          border: '1.5px solid #e5e7eb', marginBottom: '32px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.07)'
        }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '20px', fontWeight: 700, color: '#111827' }}>
            🎪 Tạo sự kiện mới
          </h2>

          {createError && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px',
              padding: '12px 16px', color: '#dc2626', marginBottom: '16px', fontSize: '0.9rem'
            }}>
              ⚠️ {createError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#374151', marginBottom: '6px', fontSize: '0.9rem' }}>
                Tên sự kiện *
              </label>
              <input
                type="text"
                placeholder="VD: BLACKPINK WORLD TOUR 2026"
                value={createForm.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '8px',
                  border: '1.5px solid #d1d5db', fontSize: '0.95rem', outline: 'none',
                  boxSizing: 'border-box', background: '#fafafa', cursor: 'pointer', color: '#111827'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#374151', marginBottom: '6px', fontSize: '0.9rem' }}>
                Địa điểm *
              </label>
              <input
                type="text"
                placeholder="VD: Sân vận động Quốc gia Mỹ Đình"
                value={createForm.venue}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, venue: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '8px',
                  border: '1.5px solid #d1d5db', fontSize: '0.95rem', outline: 'none',
                  boxSizing: 'border-box', background: '#fafafa', cursor: 'pointer', color: '#111827'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#374151', marginBottom: '6px', fontSize: '0.9rem' }}>
                Ngày & Giờ *
              </label>
              <input
                type="datetime-local"
                value={createForm.startsAt}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, startsAt: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '8px',
                  border: '1.5px solid #d1d5db', fontSize: '0.95rem', outline: 'none',
                  boxSizing: 'border-box', background: '#fafafa', cursor: 'pointer', color: '#111827'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#374151', marginBottom: '6px', fontSize: '0.9rem' }}>
                Slug (tự động từ tên)
              </label>
              <input
                type="text"
                placeholder="VD: blackpink-world-tour-2026"
                value={createForm.slug}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, slug: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '8px',
                  border: '1.5px solid #d1d5db', fontSize: '0.95rem', outline: 'none',
                  boxSizing: 'border-box', background: '#fafafa', cursor: 'pointer', color: '#111827'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#374151', marginBottom: '6px', fontSize: '0.9rem' }}>
                Trạng thái *
              </label>
              <select
                value={createForm.status}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, status: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '8px',
                  border: '1.5px solid #d1d5db', fontSize: '0.95rem', outline: 'none',
                  boxSizing: 'border-box', background: '#fafafa', cursor: 'pointer', color: '#111827',
                }}
              >
                <option value="ON_SALE">🟢 ON_SALE — Hiển thị đến khán giả ngay</option>
                <option value="DRAFT">□ DRAFT — Ẩn khỏi danh sách (chưa công bố)</option>
              </select>
            </div>
          </div>

          <p style={{ color: '#9ca3af', fontSize: '0.82rem', marginBottom: '16px' }}>
            * Sau khi tạo, bấm <strong>Chi tiết</strong> để thêm Ticket Types (tên/giá/số lượng) và upload AI Bio.
          </p>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleCreateSubmit}
              disabled={isCreating}
              style={{
                padding: '12px 28px', background: isCreating ? '#d1d5db' : '#10b981',
                color: isCreating ? '#9ca3af' : 'white', border: 'none', borderRadius: '8px',
                fontWeight: 700, cursor: isCreating ? 'not-allowed' : 'pointer', fontSize: '0.95rem'
              }}
            >
              {isCreating ? '⏳ Đang lưu...' : '💾 Lưu sự kiện'}
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setCreateError(''); setCreateForm({ title: '', venue: '', startsAt: '', slug: '', status: 'ON_SALE' }); }}
              style={{
                padding: '12px 24px', background: 'white', color: '#6b7280',
                border: '1.5px solid #d1d5db', borderRadius: '8px',
                fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem'
              }}
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Concert Table */}
      <div style={{
        background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb',
        overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#111827', fontWeight: 700 }}>
            📋 Danh sách Sự kiện
          </h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: '15px', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Tên Sự Kiện</th>
              <th style={{ padding: '15px', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Ngày Diễn Ra</th>
              <th style={{ padding: '15px', textAlign: 'center', color: '#374151', fontWeight: 600 }}>Hạng Vé</th>
              <th style={{ padding: '15px', textAlign: 'center', color: '#374151', fontWeight: 600 }}>AI Bio</th>
              <th style={{ padding: '15px', textAlign: 'right', color: '#374151', fontWeight: 600 }}>Hành Động</th>
            </tr>
          </thead>
          <tbody>
            {concerts.map((c: any) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '15px', fontWeight: 600, color: '#111827' }}>
                  <div>{c.title}</div>
                  <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '2px' }}>/{c.slug}</div>
                </td>
                <td style={{ padding: '15px', color: '#4b5563' }}>
                  {new Date(c.startsAt).toLocaleString('vi-VN')}
                </td>
                <td style={{ padding: '15px', textAlign: 'center', color: '#4b5563' }}>
                  {c.ticketTypes?.length || 0} loại
                </td>
                <td style={{ padding: '15px', textAlign: 'center' }}>
                  {c.artistBio ? (
                    <span style={{
                      background: '#f0fdf4', color: '#059669', padding: '3px 10px',
                      borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600,
                      border: '1px solid #bbf7d0'
                    }}>
                      ✅ Có Bio
                    </span>
                  ) : (
                    <span style={{
                      background: '#f9fafb', color: '#9ca3af', padding: '3px 10px',
                      borderRadius: '20px', fontSize: '0.8rem', fontWeight: 500,
                      border: '1px solid #e5e7eb'
                    }}>
                      — Chưa có
                    </span>
                  )}
                </td>
                <td style={{ padding: '15px', textAlign: 'right' }}>
                  <button
                    onClick={() => navigate(`/admin/concerts/${c.id}`)}
                    style={{
                      background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                      padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '0.85rem', fontWeight: 500, marginRight: '8px'
                    }}
                  >
                    🔍 Chi tiết
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    style={{
                      background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca',
                      padding: '6px 12px', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '0.85rem', fontWeight: 500
                    }}
                  >
                    Hủy
                  </button>
                </td>
              </tr>
            ))}
            {concerts.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                  Chưa có sự kiện nào. Bấm "Tạo sự kiện mới" để bắt đầu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
