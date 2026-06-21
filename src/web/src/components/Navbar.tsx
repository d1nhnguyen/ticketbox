import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const Navbar = () => {
  const { role, logout } = useAuth();
  return (
    <nav style={{ padding: '15px', background: '#111827', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Link to="/" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 'bold', fontSize: '1.25rem', letterSpacing: '1px' }}>TICKETBOX</Link>
      <div>
        {role === 'ORGANIZER' && <Link to="/admin" style={{ marginRight: '20px', color: '#9ca3af', textDecoration: 'none' }}>Admin Dashboard</Link>}
        {role ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ background: '#374151', padding: '5px 12px', borderRadius: '20px', fontSize: '0.875rem' }}>Role: {role}</span>
            <button onClick={logout} style={{ background: '#dc2626', color: 'white', padding: '6px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Đăng xuất</button>
          </span>
        ) : (
          <Link to="/login" style={{ background: '#2563eb', color: 'white', padding: '8px 16px', textDecoration: 'none', borderRadius: '6px', fontWeight: 'bold' }}>Đăng nhập</Link>
        )}
      </div>
    </nav>
  );
};