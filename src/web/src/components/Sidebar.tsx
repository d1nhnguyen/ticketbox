import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

export interface SidebarNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export function SidebarNav({ items }: { items: SidebarNavItem[] }) {
  return (
    <nav className="sidebar-nav">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
        >
          <item.icon />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
