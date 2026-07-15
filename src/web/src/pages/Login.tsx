import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await apiClient.post('/auth/login', { email, password });
      const token = res.data.access_token;
      if (!token) throw new Error("Không nhận được token");

      const payloadBase64 = token.split('.')[1];
      const decodedPayload = JSON.parse(atob(payloadBase64));
      const role = decodedPayload.role;

      login(token, role);

      if (role === 'ORGANIZER') navigate('/admin');
      else if (role === 'SCANNER') navigate('/scanner');
      else navigate('/');
    } catch (err) {
      setError('Đăng nhập thất bại. Vui lòng kiểm tra lại Email/Password!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ textAlign: 'center', fontSize: 22, marginBottom: 10 }}>Đăng nhập</h2>
      <p style={{ textAlign: 'center', color: 'var(--text-2)', marginBottom: 28 }}>Đăng nhập bằng tài khoản seed data</p>
      {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14 }}>
        Chưa có tài khoản? <Link to="/register" style={{ fontWeight: 700 }}>Đăng ký ngay</Link>
      </div>
    </div>
  );
}
