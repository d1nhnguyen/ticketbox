import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import apiClient from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import CreateConcertModal from '../../components/admin/CreateConcertModal';

export default function Concerts() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [concerts, setConcerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchConcerts = async () => {
    try {
      const res = await apiClient.get('/admin/concerts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConcerts(res.data);
    } catch (err) {
      console.error('Lỗi tải danh sách sự kiện:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConcerts();
  }, [token]);

  const handleDelete = async (id: string, status: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy sự kiện này? Hành động này không thể hoàn tác.')) return;

    try {
      if (status === 'DRAFT') {
        await apiClient.delete(`/admin/concerts/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setConcerts((prev) => prev.filter((c) => c.id !== id));
      } else {
        await apiClient.post(`/admin/concerts/${id}/cancel`, {}, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setConcerts((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'CANCELLED' } : c)));
      }
    } catch {
      alert('Lỗi khi hủy sự kiện. Vui lòng kiểm tra lại quyền hoặc thử lại sau.');
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'ON_SALE') return <span className="badge badge-success">Đang mở bán</span>;
    if (status === 'CANCELLED') return <span className="badge badge-danger">Đã hủy</span>;
    return <span className="badge badge-muted">Bản nháp</span>;
  };

  if (loading) {
    return (
      <div className="empty-state">
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        Đang tải danh sách sự kiện...
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Sự kiện</div>
          <div className="page-subtitle">Quản lý toàn bộ sự kiện, hạng vé và trạng thái mở bán</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Tạo sự kiện mới
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Tên sự kiện</th>
              <th>Ngày diễn ra</th>
              <th style={{ textAlign: 'center' }}>Hạng vé</th>
              <th style={{ textAlign: 'center' }}>AI Bio</th>
              <th style={{ textAlign: 'center' }}>Trạng thái</th>
              <th style={{ textAlign: 'right' }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {concerts.map((c: any) => (
              <tr key={c.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>/{c.slug}</div>
                </td>
                <td>{new Date(c.startsAt).toLocaleString('vi-VN')}</td>
                <td style={{ textAlign: 'center' }}>{c.ticketTypes?.length || 0} loại</td>
                <td style={{ textAlign: 'center' }}>
                  {c.artistBio ? (
                    <span className="badge badge-success">Có Bio</span>
                  ) : (
                    <span className="badge badge-muted">Chưa có</span>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>{statusBadge(c.status)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigate(`/admin/concerts/${c.id}`)}
                    style={{ marginRight: 8 }}
                  >
                    <Search size={14} /> Chi tiết
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(c.id, c.status)}
                    disabled={c.status === 'CANCELLED'}
                  >
                    Hủy
                  </button>
                </td>
              </tr>
            ))}
            {concerts.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">Chưa có sự kiện nào. Bấm "Tạo sự kiện mới" để bắt đầu.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <CreateConcertModal onClose={() => setShowCreateModal(false)} onCreated={fetchConcerts} />
      )}
    </div>
  );
}
