import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';

export default function Dashboard() {
  const { token } = useAuth();
  const [concerts, setConcerts] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalRevenue: 0, totalTicketsSold: 0 });
  const [loading, setLoading] = useState(true);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingConcertId, setEditingConcertId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    title: '',
    slug: '',
    venue: '',
    startsAt: '',
    status: 'ON_SALE',
    artistBio: '',
    bioSourceUrl: '',
    seatMapSvg: '',
  });
  const [ticketTypeForm, setTicketTypeForm] = useState({
    name: '',
    price: '',
    totalQty: '',
    maxPerUser: '',
    saleStartsAt: '',
  });
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchAdminData = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const authHeader = { Authorization: `Bearer ${token}` };

        const resConcerts = await axios.get('http://localhost:3000/admin/concerts', {
          headers: authHeader,
        });
        const concertsData = resConcerts.data;
        setConcerts(concertsData);

        const statsList = await Promise.all(
          concertsData.map((concert: any) =>
            axios.get(`http://localhost:3000/admin/concerts/${concert.id}/stats`, {
              headers: authHeader,
            }).then((response) => response.data)
          )
        );

        const totalRevenue = statsList.reduce((sum, stat) => sum + (stat.totalRevenue || 0), 0);
        const totalTicketsSold = statsList.reduce(
          (sum, stat) => sum + (stat.ticketTypes?.reduce((ticketSum: number, ticket: any) => ticketSum + (ticket.soldQty || 0), 0) || 0),
          0
        );

        setStats({ totalRevenue, totalTicketsSold });
      } catch (err) {
        console.error('Lỗi tải dữ liệu Admin:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
  }, [token]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy sự kiện này?')) return;

    try {
      await axios.post(
        `http://localhost:3000/admin/concerts/${id}/cancel`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setConcerts(concerts.filter((c) => c.id !== id));
      alert('Đã hủy sự kiện thành công!');
    } catch (err) {
      alert('Lỗi khi hủy sự kiện. Kiểm tra lại quyền hoặc thử lại sau.');
    }
  };

  const resetCreateForm = () => {
    setCreateForm({
      title: '',
      slug: '',
      venue: '',
      startsAt: '',
      status: 'ON_SALE',
      artistBio: '',
      bioSourceUrl: '',
      seatMapSvg: '',
    });
    setTicketTypeForm({
      name: '',
      price: '',
      totalQty: '',
      maxPerUser: '',
      saleStartsAt: '',
    });
    setEditingConcertId(null);
  };

  const handleEditConcert = (concert: any) => {
    setEditingConcertId(concert.id);
    setCreateForm({
      title: concert.title || '',
      slug: concert.slug || '',
      venue: concert.venue || '',
      startsAt: concert.startsAt ? new Date(concert.startsAt).toISOString().slice(0, 16) : '',
      status: concert.status || 'ON_SALE',
      artistBio: concert.artistBio || '',
      bioSourceUrl: concert.bioSourceUrl || '',
      seatMapSvg: concert.seatMapSvg || '',
    });
    setShowCreateForm(true);
    setCreateError('');
    setCreateSuccess('');
  };

  const handleSaveConcert = async () => {
    if (!token) {
      setCreateError('Bạn cần đăng nhập với vai trò ORGANIZER.');
      return;
    }

    if (!createForm.title || !createForm.slug || !createForm.venue || !createForm.startsAt) {
      setCreateError('Vui lòng điền đầy đủ thông tin sự kiện bắt buộc.');
      return;
    }

    setIsSaving(true);
    setCreateError('');
    setCreateSuccess('');

    try {
      const payload = {
        ...createForm,
        startsAt: new Date(createForm.startsAt).toISOString(),
        status: createForm.status as 'DRAFT' | 'ON_SALE' | 'CANCELLED',
      };

      const concertRes = editingConcertId
        ? await axios.patch(`http://localhost:3000/admin/concerts/${editingConcertId}`, payload, {
            headers: { Authorization: `Bearer ${token}` },
          })
        : await axios.post('http://localhost:3000/admin/concerts', payload, {
            headers: { Authorization: `Bearer ${token}` },
          });

      const savedConcert = concertRes.data;

      if (ticketTypeForm.name && ticketTypeForm.price && ticketTypeForm.totalQty && ticketTypeForm.maxPerUser && ticketTypeForm.saleStartsAt) {
        await axios.post(
          'http://localhost:3000/admin/ticket-types',
          {
            concertId: savedConcert.id,
            name: ticketTypeForm.name,
            price: Number(ticketTypeForm.price),
            totalQty: Number(ticketTypeForm.totalQty),
            maxPerUser: Number(ticketTypeForm.maxPerUser),
            saleStartsAt: new Date(ticketTypeForm.saleStartsAt).toISOString(),
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }

      setCreateSuccess(editingConcertId ? 'Cập nhật sự kiện thành công!' : 'Tạo sự kiện thành công!');
      resetCreateForm();
      setShowCreateForm(false);
      window.location.reload();
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 400) {
        setCreateError('Dữ liệu không hợp lệ. Kiểm tra lại thông tin nhập vào.');
      } else {
        setCreateError('Không thể lưu sự kiện. Vui lòng thử lại sau.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div style={{ padding: '50px', textAlign: 'center', fontSize: '1.2rem' }}>Đang tải dữ liệu hệ thống...</div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: '#111827', fontSize: '2rem' }}>⚙️ Admin Dashboard</h1>
        <button 
          onClick={() => setShowCreateForm(!showCreateForm)}
          style={{ background: showCreateForm ? '#ef4444' : '#10b981', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
          {showCreateForm ? 'Hủy thêm mới' : '+ Tạo sự kiện mới'}
        </button>
      </div>

      {/* Thẻ Thống kê Tổng quan */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '40px' }}>
        <div style={{ flex: 1, background: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <h3 style={{ color: '#6b7280', fontSize: '1.1rem', marginBottom: '10px' }}>Tổng Doanh Thu (Ước tính)</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#10b981' }}>{stats.totalRevenue.toLocaleString('vi-VN')} VNĐ</p>
        </div>
        <div style={{ flex: 1, background: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <h3 style={{ color: '#6b7280', fontSize: '1.1rem', marginBottom: '10px' }}>Tổng Số Vé Đã Bán</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#3b82f6' }}>{stats.totalTicketsSold} vé</p>
        </div>
      </div>

      {showCreateForm && (
        <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '12px', border: '2px dashed #cbd5e1', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Tạo sự kiện mới</h2>

          {createError && (
            <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 12px', borderRadius: '6px', marginBottom: '15px' }}>{createError}</div>
          )}
          {createSuccess && (
            <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 12px', borderRadius: '6px', marginBottom: '15px' }}>{createSuccess}</div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            <input value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} type="text" placeholder="Tên sự kiện..." style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            <input value={createForm.venue} onChange={(e) => setCreateForm({ ...createForm, venue: e.target.value })} type="text" placeholder="Địa điểm..." style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            <input value={createForm.startsAt} onChange={(e) => setCreateForm({ ...createForm, startsAt: e.target.value })} type="datetime-local" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            <input value={createForm.slug} onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })} type="text" placeholder="Slug..." style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            <input value={createForm.artistBio} onChange={(e) => setCreateForm({ ...createForm, artistBio: e.target.value })} type="text" placeholder="Tiểu sử nghệ sĩ (tùy chọn)" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            <input value={createForm.bioSourceUrl} onChange={(e) => setCreateForm({ ...createForm, bioSourceUrl: e.target.value })} type="text" placeholder="Link nguồn bio" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            <select value={createForm.status} onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
              <option value="DRAFT">DRAFT</option>
              <option value="ON_SALE">ON_SALE</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
            <textarea value={createForm.seatMapSvg} onChange={(e) => setCreateForm({ ...createForm, seatMapSvg: e.target.value })} placeholder="SVG sơ đồ ghế (tùy chọn)" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', minHeight: '90px' }} />
          </div>

          <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '15px' }}>
            <h3 style={{ marginBottom: '10px', fontSize: '1rem' }}>Loại vé đầu tiên (tùy chọn)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 1fr', gap: '10px' }}>
              <input value={ticketTypeForm.name} onChange={(e) => setTicketTypeForm({ ...ticketTypeForm, name: e.target.value })} type="text" placeholder="Tên hạng vé" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <input value={ticketTypeForm.price} onChange={(e) => setTicketTypeForm({ ...ticketTypeForm, price: e.target.value })} type="number" placeholder="Giá" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <input value={ticketTypeForm.totalQty} onChange={(e) => setTicketTypeForm({ ...ticketTypeForm, totalQty: e.target.value })} type="number" placeholder="Tổng số lượng" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <input value={ticketTypeForm.maxPerUser} onChange={(e) => setTicketTypeForm({ ...ticketTypeForm, maxPerUser: e.target.value })} type="number" placeholder="Tối đa / user" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              <input value={ticketTypeForm.saleStartsAt} onChange={(e) => setTicketTypeForm({ ...ticketTypeForm, saleStartsAt: e.target.value })} type="datetime-local" style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>
          </div>

          <button onClick={handleSaveConcert} disabled={isSaving} style={{ background: isSaving ? '#94a3b8' : '#2563eb', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: isSaving ? 'not-allowed' : 'pointer' }}>
            {isSaving ? 'Đang lưu...' : editingConcertId ? 'Cập nhật sự kiện' : 'Lưu sự kiện'}
          </button>
        </div>
      )}

      {/* Bảng Quản lý Danh sách Sự kiện */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ padding: '15px', textAlign: 'left', color: '#374151' }}>Tên Sự Kiện</th>
              <th style={{ padding: '15px', textAlign: 'left', color: '#374151' }}>Ngày Diễn Ra</th>
              <th style={{ padding: '15px', textAlign: 'center', color: '#374151' }}>Hạng Vé</th>
              <th style={{ padding: '15px', textAlign: 'right', color: '#374151' }}>Hành Động</th>
            </tr>
          </thead>
          <tbody>
            {concerts.map((c: any) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '15px', fontWeight: 'bold', color: '#111827' }}>{c.title}</td>
                <td style={{ padding: '15px', color: '#4b5563' }}>{new Date(c.startsAt).toLocaleString('vi-VN')}</td>
                <td style={{ padding: '15px', textAlign: 'center', color: '#4b5563' }}>{c.ticketTypes?.length || 0} loại</td>
                <td style={{ padding: '15px', textAlign: 'right' }}>
                  <button onClick={() => handleEditConcert(c)} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '6px 12px', borderRadius: '6px', marginRight: '10px', cursor: 'pointer' }}>Sửa</button>
                  <button 
                    onClick={() => handleDelete(c.id)}
                    style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}>
                    Hủy
                  </button>
                </td>
              </tr>
            ))}
            {concerts.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: '#6b7280' }}>Chưa có sự kiện nào.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}