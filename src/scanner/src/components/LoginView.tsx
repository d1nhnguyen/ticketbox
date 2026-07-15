import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { LogIn, WifiOff, Ticket } from 'lucide-react';
import { login } from '../services/api';
import { decodeJwt, setToken } from '../services/session';

interface Props {
  onLoggedIn: (session: { email: string; role: string }) => void;
}

export default function LoginView({ onLoggedIn }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOnline || submitting) return;
    setError('');
    setSubmitting(true);

    try {
      const token = await login(email.trim(), password);
      const payload = decodeJwt(token);

      if (!payload || payload.role !== 'SCANNER') {
        // Không lưu token của tài khoản không có quyền soát vé.
        setError('Tài khoản này không có quyền soát vé (yêu cầu role SCANNER).');
        return;
      }

      setToken(token);
      onLoggedIn({ email: payload.email, role: payload.role });
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setError('Email hoặc mật khẩu không đúng.');
      } else if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError('Thử lại quá nhiều lần. Vui lòng chờ một lát.');
      } else {
        setError('Không thể kết nối đến máy chủ. Kiểm tra mạng và thử lại.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="scan-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ padding: 30, width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
          <Ticket size={22} color="var(--primary)" />
          <h1 style={{ fontSize: 20 }}>TB Scanner</h1>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--text-2)', fontSize: 14, marginBottom: 20 }}>Đăng nhập bằng tài khoản soát vé</p>

        {!isOnline && (
          <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 15 }}>
            <WifiOff size={18} /> Cần kết nối mạng để đăng nhập.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input
            className="input"
            style={{ marginBottom: 12 }}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            className="input"
            style={{ marginBottom: 12 }}
            type="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 12px 0' }}>{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={!isOnline || submitting}>
            <LogIn size={18} /> {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
