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

            <Route path="/notifications" element={<Notifications />} />
            <Route path="/vnpay-return" element={<VNPayReturn />} />

            {/* Tuyến đường được bảo vệ cho Admin */}
            <Route element={<ProtectedRoute allowedRoles={['ORGANIZER']} />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/concerts/:id" element={<AdminConcertDetail />} />
              <Route path="/admin/ai-bio" element={<AiBioUpload />} />
              <Route path="/admin/csv-upload" element={<CsvUpload />} />
            </Route>

            {/* Task C2a: Scanner Placeholder */}
            <Route path="/scanner" element={
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <h2 style={{ color: '#111827' }}>📱 Ứng dụng Soát vé (Scanner PWA)</h2>
                <p style={{ color: '#4b5563', marginTop: '10px' }}>Tính năng này đang được phát triển ở Tuần 3.</p>
              </div>
            } />

            <Route path="*" element={<div style={{ padding: '50px', textAlign: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>404 - Không tìm thấy trang</div>} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}