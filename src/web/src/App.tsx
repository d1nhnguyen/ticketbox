import { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

// ==========================================
// 1. AUTHENTICATION & STATE 
// ==========================================
type Role = 'AUDIENCE' | 'ORGANIZER' | 'SCANNER' | null;

interface AuthContextType {
  role: Role;
  token: string | null;
  login: (token: string, selectedRole: Role) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [role, setRole] = useState<Role>((localStorage.getItem('role') as Role) || null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token') || null);

  const login = (newToken: string, newRole: Role) => {
    setToken(newToken);
    setRole(newRole);
    localStorage.setItem('token', newToken);
    if (newRole) localStorage.setItem('role', newRole);
  };

  const logout = () => {
    setToken(null);
    setRole(null);
    localStorage.removeItem('token');
    localStorage.removeItem('role');
  };

  return (
    <AuthContext.Provider value={{ role, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

// ==========================================
// 2. COMPONENTS & PAGES
// ==========================================

// --- Route Guard: Bảo vệ trang nội bộ ---
const ProtectedRoute = ({ allowedRoles }: { allowedRoles: string[] }) => {
  const { role } = useAuth();
  if (!role) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(role)) return <Navigate to="/" replace />;
  return <Outlet />;
};

// --- Navbar dùng chung ---
const Navbar = () => {
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

// --- Trang chủ: Danh sách Concert (Lấy từ API) ---
const Home = () => {
  const [concerts, setConcerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Gọi API thật từ backend Person A
    axios.get('http://localhost:3000/concerts')
      .then(res => setConcerts(res.data))
      .catch(err => {
        console.error("Lỗi fetch concerts:", err);
        setError('Không thể kết nối đến Backend. Vui lòng đảm bảo docker-compose up đang chạy!');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '30px 20px' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '30px', color: '#1f2937' }}>Concert đang mở bán</h1>
      
      {loading && <p>Đang tải dữ liệu từ API...</p>}
      {error && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>{error}</div>}
      
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '25px' }}>
          {concerts.map((c: any) => (
            <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ height: '150px', background: 'linear-gradient(to right, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>Image Placeholder</div>
              <div style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '10px', color: '#111827' }}>{c.title}</h3>
                <p style={{ color: '#4b5563', marginBottom: '5px', fontSize: '0.9rem' }}>📍 {c.venue}</p>
                <p style={{ color: '#4b5563', marginBottom: '20px', fontSize: '0.9rem' }}>⏰ {new Date(c.startsAt).toLocaleString('vi-VN')}</p>
                <Link to={`/concert/${c.slug}`} style={{ display: 'block', textAlign: 'center', background: '#111827', color: 'white', padding: '10px 0', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold' }}>Xem chi tiết</Link>
              </div>
            </div>
          ))}
          {concerts.length === 0 && <p>Chưa có concert nào trong Database. Vui lòng chạy lệnh seed của backend.</p>}
        </div>
      )}
    </div>
  );
};

// --- Trang Chi tiết Concert ---
const ConcertDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const [concert, setConcert] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`http://localhost:3000/concerts/${slug}`)
      .then(res => setConcert(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div style={{ padding: '50px', textAlign: 'center' }}>Đang tải...</div>;
  if (!concert) return <div style={{ padding: '50px', textAlign: 'center', color: 'red' }}>Không tìm thấy Concert hoặc lỗi API!</div>;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '30px 20px' }}>
      <Link to="/" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 'bold' }}>← Quay lại danh sách</Link>
      
      <div style={{ marginTop: '30px', background: 'white', padding: '30px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '15px' }}>{concert.title}</h1>
        <p style={{ fontSize: '1.1rem', color: '#4b5563', marginBottom: '30px' }}>📍 {concert.venue} &nbsp;|&nbsp; ⏰ {new Date(concert.startsAt).toLocaleString('vi-VN')}</p>

        <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
          {/* Cột trái: Sơ đồ ghế */}
          <div style={{ flex: '1 1 400px', background: '#f9fafb', minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1', borderRadius: '12px' }}>
            <p style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#64748b' }}>Khu vực Sơ đồ ghế ngồi</p>
            <p style={{ color: '#94a3b8', marginTop: '10px' }}>Interactive SVG Map sẽ được thêm vào Week 2</p>
          </div>

          {/* Cột phải: Danh sách vé */}
          <div style={{ flex: '1 1 300px' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Các loại vé</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {concert.ticketTypes?.map((ticket: any) => (
                <div key={ticket.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{ticket.name}</div>
                    <div style={{ color: '#ef4444', fontWeight: 'bold', marginTop: '5px' }}>{ticket.price.toLocaleString('vi-VN')} VNĐ</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ marginBottom: '10px', fontSize: '0.9rem' }}>Còn lại: <strong>{ticket.remainingQty}</strong></div>
                    <button disabled={ticket.remainingQty === 0} style={{ background: ticket.remainingQty === 0 ? '#e5e7eb' : '#2563eb', color: ticket.remainingQty === 0 ? '#9ca3af' : 'white', border: 'none', padding: '8px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: ticket.remainingQty === 0 ? 'not-allowed' : 'pointer' }}>
                      {ticket.remainingQty === 0 ? 'Đã bán hết' : 'Mua ngay'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Trang Đăng nhập (Gọi API thật) ---
const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // 1. Gọi API
      const res = await axios.post('http://localhost:3000/auth/login', { email, password });
      
      // 2. Lấy access_token từ đúng key của backend trả về
      const token = res.data.access_token;
      
      if (!token) throw new Error("Không nhận được token");

      // 3. Giải mã JWT token (Payload nằm ở phần thứ 2 của chuỗi, cách nhau bởi dấu chấm)
      const payloadBase64 = token.split('.')[1];
      const decodedPayload = JSON.parse(atob(payloadBase64));
      
      // 4. Lấy role từ payload đã giải mã
      const role = decodedPayload.role; 
      
      // 5. Cập nhật state
      login(token, role);
      
      // 6. Chuyển hướng
      if (role === 'ORGANIZER') navigate('/admin');
      else if (role === 'SCANNER') navigate('/scanner');
      else navigate('/');
      
    } catch (err) {
      console.error(err);
      setError('Đăng nhập thất bại. Vui lòng kiểm tra lại Email/Password!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '10px', fontSize: '1.8rem' }}>Đăng nhập</h2>
        <p style={{ textAlign: 'center', color: '#6b7280', marginBottom: '30px' }}>Đăng nhập bằng tài khoản seed data</p>
        
        {error && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px', borderRadius: '6px', marginBottom: '20px', fontSize: '0.9rem' }}>{error}</div>}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '0.9rem' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '0.9rem' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={loading} style={{ background: '#111827', color: 'white', padding: '12px', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '1rem', cursor: loading ? 'wait' : 'pointer', marginTop: '10px' }}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div style={{ marginTop: '20px', fontSize: '0.85rem', color: '#6b7280', textAlign: 'center' }}>
          (Sử dụng các tài khoản tạo ra từ file seed.ts của Backend)
        </div>
      </div>
    </div>
  );
};

// --- Trang Admin ---
const AdminDashboard = () => (
  <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px' }}>
    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '30px' }}>
      <h1 style={{ color: '#b91c1c', marginBottom: '10px' }}>⚙️ Admin Dashboard</h1>
      <p style={{ color: '#991b1b', fontSize: '1.1rem' }}>Bạn đã vượt qua Route Guard. Khu vực này chỉ dành cho tài khoản ORGANIZER.</p>
    </div>
  </div>
);

// ==========================================
// 3. MAIN APP
// ==========================================
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: '100vh' }}>
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/concert/:slug" element={<ConcertDetail />} />
            
            {/* Tuyến đường được bảo vệ */}
            <Route element={<ProtectedRoute allowedRoles={['ORGANIZER']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
            
            <Route path="*" element={<div style={{ padding: '50px', textAlign: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>404 - Không tìm thấy trang</div>} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}