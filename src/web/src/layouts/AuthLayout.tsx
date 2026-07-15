import { Link, Outlet } from 'react-router-dom';
import { Ticket } from 'lucide-react';

export function AuthLayout() {
  return (
    <div className="auth-shell">
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Link to="/" className="auth-brand">
          <Ticket size={22} color="var(--primary)" />
          TICKETBOX
        </Link>
        <div className="auth-card">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
