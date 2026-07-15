import { Link } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, Sparkles, FileUp, LogOut, ArrowLeftRight } from 'lucide-react';
import { SidebarLayout } from './SidebarLayout';
import { useAuth } from '../hooks/useAuth';
import { decodeJwt } from '../lib/jwt';
import type { SidebarNavItem } from '../components/Sidebar';

const navItems: SidebarNavItem[] = [
  { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/admin/concerts', label: 'Sự kiện', icon: CalendarDays },
  { to: '/admin/ai-bio', label: 'AI Bio', icon: Sparkles },
  { to: '/admin/csv-upload', label: 'Import khách mời', icon: FileUp },
];

export function AdminLayout() {
  const { token, logout } = useAuth();
  const email = token ? decodeJwt(token)?.email ?? decodeJwt(token)?.sub : null;
  const initial = (email ?? 'O').toString().charAt(0).toUpperCase();

  return (
    <SidebarLayout
      navItems={navItems}
      brandTo="/admin"
      footer={
        <>
          <div className="sidebar-user">
            <span className="sidebar-user-avatar">{initial}</span>
            <div className="sidebar-user-info">
              <span className="sidebar-user-email">{email ?? 'Organizer'}</span>
              <span className="sidebar-user-role">Ban tổ chức</span>
            </div>
          </div>
          <Link to="/" className="sidebar-link" style={{ padding: '8px 0' }}>
            <ArrowLeftRight size={16} />
            Xem trang khán giả
          </Link>
          <button className="btn btn-ghost btn-sm" onClick={logout} style={{ justifyContent: 'flex-start' }}>
            <LogOut size={16} />
            Đăng xuất
          </button>
        </>
      }
    />
  );
}
