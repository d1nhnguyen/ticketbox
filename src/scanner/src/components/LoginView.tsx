import { useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { LogIn, WifiOff } from 'lucide-react';
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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '14px', boxSizing: 'border-box', borderRadius: '8px',
    border: '1.5px solid #d1d5db', fontSize: '1rem', outline: 'none', marginBottom: '12px',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '30px', width: '100%', maxWidth: '380px' }}>
        <h1 style={{ margin: '0 0 6px 0', fontSize: '1.4rem', color: '#111827', fontWeight: 800, textAlign: 'center' }}>🎫 TB Scanner</h1>
        <p style={{ margin: '0 0 20px 0', color: '#000000ff', textAlign: 'center', fontSize: '0.9rem' }}>Đăng nhập bằng tài khoản soát vé</p>

        {!isOnline && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', padding: '10px 12px', marginBottom: '15px', fontSize: '0.9rem' }}>
            <WifiOff size={18} /> Cần kết nối mạng để đăng nhập.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input
            style={inputStyle}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            style={inputStyle}
            type="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && (
            <p style={{ color: '#dc2626', fontSize: '0.9rem', margin: '0 0 12px 0' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={!isOnline || submitting}
            style={{
              width: '100%', padding: '14px', borderRadius: '8px', border: 'none',
              background: (!isOnline || submitting) ? '#9ca3af' : '#2563eb', color: 'white',
              fontSize: '1rem', fontWeight: 700, cursor: (!isOnline || submitting) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            <LogIn size={18} /> {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
