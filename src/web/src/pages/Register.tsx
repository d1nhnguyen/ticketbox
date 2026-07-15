import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiClient from '../api/client';

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await apiClient.post('/auth/register', { email, password });
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Đăng ký thất bại. Email có thể đã tồn tại.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ color: 'var(--success)', marginBottom: 10 }}>Đăng ký thành công</h2>
        <p style={{ color: 'var(--text-2)' }}>Tự động chuyển hướng đến trang đăng nhập...</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ textAlign: 'center', fontSize: 22, marginBottom: 10 }}>Đăng ký tài khoản</h2>
      <p style={{ textAlign: 'center', color: 'var(--text-2)', marginBottom: 28 }}>Tạo tài khoản khán giả mới</p>
      {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Đang xử lý...' : 'Đăng ký'}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 14 }}>
        Đã có tài khoản? <Link to="/login" style={{ fontWeight: 700 }}>Đăng nhập ngay</Link>
      </div>
    </div>
  );
}
