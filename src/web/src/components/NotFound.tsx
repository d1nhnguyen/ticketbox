import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="empty-state" style={{ padding: '80px 20px' }}>
      <Compass className="empty-state-icon" />
      <h2 style={{ marginBottom: 8 }}>404 - Không tìm thấy trang</h2>
      <p style={{ marginBottom: 20 }}>Trang bạn tìm không tồn tại hoặc đã bị di chuyển.</p>
      <Link to="/" className="btn btn-primary">
        Về trang chủ
      </Link>
    </div>
  );
}
