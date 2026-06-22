import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';

export default function Dashboard() {
  const { token } = useAuth();
  const [concerts, setConcerts] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalRevenue: 0, totalTicketsSold: 0 });
  const [loading, setLoading] = useState(true);

  // Mở form tạo mới
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    // Gọi API lấy danh sách sự kiện và thống kê (giả định endpoint /admin/stats do Person A viết)
    const fetchAdminData = async () => {
      try {
        // Trong thực tế, Person A sẽ cung cấp endpoint /admin/stats. 
        // Ở đây chúng ta tạm gọi /concerts để hiển thị danh sách CRUD.
        const resConcerts = await axios.get('http://localhost:3000/concerts');
        setConcerts(resConcerts.data);

        // Giả lập tính toán thống kê từ danh sách (hoặc gọi API thật nếu Person A đã làm xong)
        let revenue = 0;
        let sold = 0;
        resConcerts.data.forEach((c: any) => {
          c.ticketTypes?.forEach((t: any) => {
            const soldTickets = t.totalQty - t.remainingQty;
            sold += soldTickets;
            revenue += soldTickets * t.price;
          });
        });

        setStats({ totalRevenue: revenue, totalTicketsSold: sold });
      } catch (err) {
        console.error("Lỗi tải dữ liệu Admin:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAdminData();
  }, [token]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn hủy sự kiện này? Hành động này không thể hoàn tác.")) return;
    
    try {
      await axios.delete(`http://localhost:3000/concerts/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConcerts(concerts.filter(c => c.id !== id));
      alert("Đã hủy sự kiện thành công!");
    } catch (err) {
      alert("Lỗi khi hủy sự kiện. Vui lòng kiểm tra lại quyền hoặc thử lại sau.");
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

      {/* Khung Tạo Sự Kiện Mới (Skeleton / UI Placeholder) */}
      {showCreateForm && (
        <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '12px', border: '2px dashed #cbd5e1', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Tạo sự kiện mới</h2>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
            <input type="text" placeholder="Tên sự kiện..." style={{ flex: 2, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            <input type="text" placeholder="Địa điểm..." style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            <input type="datetime-local" style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
          </div>
          <button style={{ background: '#2563eb', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Lưu sự kiện</button>
          <p style={{ marginTop: '10px', fontSize: '0.9rem', color: '#64748b' }}>* Form cấu hình hạng vé (Ticket Types) chi tiết sẽ được tích hợp ở các bước sau.</p>
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
                  <button style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '6px 12px', borderRadius: '6px', marginRight: '10px', cursor: 'pointer' }}>Sửa</button>
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