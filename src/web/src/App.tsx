import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Navbar } from './components/Navbar';

// Import Pages
import Home from './pages/Home';
import Login from './pages/Login';
import ConcertDetail from './pages/ConcertDetail';
import OrderSuccess from './pages/OrderSuccess';
import AudienceDashboard from './pages/AudienceDashboard';
import Dashboard from './pages/admin/Dashboard';
import AiBioUpload from './pages/admin/AiBioUpload';
import CsvUpload from './pages/admin/CsvUpload';
import AdminConcertDetail from './pages/admin/AdminConcertDetail';
import Notifications from './pages/Notifications';
import VNPayReturn from './pages/VNPayReturn';
import Register from './pages/Register';

const SCANNER_URL: string = import.meta.env.VITE_SCANNER_URL ?? 'http://localhost:5174';

function ScannerLink() {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h2 style={{ color: '#111827' }}>📱 Ứng dụng Soát vé (Scanner PWA)</h2>
      <p style={{ color: '#4b5563', marginTop: '10px' }}>
        Ứng dụng soát vé chạy như một PWA riêng biệt để hỗ trợ chế độ offline.
      </p>
      <a
        href={SCANNER_URL}
        style={{ display: 'inline-block', marginTop: '20px', padding: '12px 24px', background: '#2563eb', color: 'white', borderRadius: '8px', fontWeight: 700, textDecoration: 'none' }}
      >
        Mở ứng dụng Scanner
      </a>
    </div>
  );
}

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
            <Route path="/orders/:id/success" element={<OrderSuccess />} />
            <Route path="/dashboard" element={<AudienceDashboard />} />

            <Route path="/register" element={<Register />} />
            <Route path="/vnpay-return" element={<VNPayReturn />} />

            {/* Tuyến đường được bảo vệ chung (yêu cầu đăng nhập) */}
            <Route element={<ProtectedRoute />}>
              <Route path="/notifications" element={<Notifications />} />
            </Route>

            {/* Tuyến đường được bảo vệ cho Admin */}
            <Route element={<ProtectedRoute allowedRoles={['ORGANIZER']} />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/concerts/:id" element={<AdminConcertDetail />} />
              <Route path="/admin/ai-bio" element={<AiBioUpload />} />
              <Route path="/admin/csv-upload" element={<CsvUpload />} />
            </Route>

            {/* Scanner chạy như một PWA riêng — trang này chỉ dẫn sang origin của scanner */}
            <Route path="/scanner" element={<ScannerLink />} />

            <Route path="*" element={<div style={{ padding: '50px', textAlign: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>404 - Không tìm thấy trang</div>} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}