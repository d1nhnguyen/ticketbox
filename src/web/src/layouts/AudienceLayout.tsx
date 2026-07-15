import { Link } from 'react-router-dom';
import { Home, Ticket, Bell, QrCode, LogOut, ShieldCheck } from 'lucide-react';
import { SidebarLayout } from './SidebarLayout';
import { useAuth } from '../hooks/useAuth';
import { decodeJwt } from '../lib/jwt';
import type { SidebarNavItem } from '../components/Sidebar';

export function AudienceLayout() {
  const { token, role, logout } = useAuth();
  const email = token ? decodeJwt(token)?.email ?? decodeJwt(token)?.sub : null;
  const initial = (email ?? 'K').toString().charAt(0).toUpperCase();

  const navItems: SidebarNavItem[] = [
    { to: '/', label: 'Trang chủ', icon: Home, end: true },
    ...(role === 'AUDIENCE'
      ? [
          { to: '/dashboard', label: 'Vé của tôi', icon: Ticket },
          { to: '/notifications', label: 'Thông báo', icon: Bell },
        ]
      : []),
    { to: '/scanner', label: 'Ứng dụng soát vé', icon: QrCode },
  ];

  return (
    <SidebarLayout
      navItems={navItems}
      footer={
        role ? (
          <>
            <div className="sidebar-user">
              <span className="sidebar-user-avatar">{initial}</span>
              <div className="sidebar-user-info">
                <span className="sidebar-user-email">{email ?? 'Tài khoản'}</span>
                <span className="sidebar-user-role">
                  {role === 'ORGANIZER' ? 'Ban tổ chức' : role === 'SCANNER' ? 'Soát vé' : 'Khán giả'}
                </span>
              </div>
            </div>
            {role === 'ORGANIZER' && (
              <Link to="/admin" className="sidebar-link" style={{ padding: '8px 0' }}>
                <ShieldCheck size={16} />
                Trang quản trị
              </Link>
            )}
            <button className="btn btn-ghost btn-sm" onClick={logout} style={{ justifyContent: 'flex-start' }}>
              <LogOut size={16} />
              Đăng xuất
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-primary" style={{ width: '100%' }}>
              Đăng nhập
            </Link>
            <Link to="/register" className="btn btn-ghost btn-sm" style={{ width: '100%' }}>
              Đăng ký tài khoản
            </Link>
          </>
        )
      }
    />
  );
}
