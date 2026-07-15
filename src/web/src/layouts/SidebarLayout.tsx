import { useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, Ticket } from 'lucide-react';
import { SidebarNav, type SidebarNavItem } from '../components/Sidebar';

interface SidebarLayoutProps {
  navItems: SidebarNavItem[];
  footer?: ReactNode;
  brandTo?: string;
}

export function SidebarLayout({ navItems, footer, brandTo = '/' }: SidebarLayoutProps) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell app-shell--with-sidebar">
      <div
        className={`sidebar-backdrop${open ? ' sidebar-backdrop--open' : ''}`}
        onClick={() => setOpen(false)}
      />
      <aside className={`sidebar${open ? ' sidebar--open' : ''}`}>
        <Link to={brandTo} className="sidebar-brand">
          <span className="sidebar-brand-mark" />
          TICKETBOX
        </Link>
        <SidebarNav items={navItems} />
        {footer && <div className="sidebar-footer">{footer}</div>}
      </aside>

      <div className="topbar">
        <button className="topbar-menu-btn" onClick={() => setOpen(true)} aria-label="Mở menu">
          <Menu size={18} />
        </button>
        <Link to={brandTo} className="topbar-brand">
          <Ticket size={18} />
          TICKETBOX
        </Link>
        <span style={{ width: 36 }} />
      </div>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
