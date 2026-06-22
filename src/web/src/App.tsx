import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Navbar } from './components/Navbar';

// Import Pages
import Home from './pages/Home';
import Login from './pages/Login';
import ConcertDetail from './pages/ConcertDetail';
import Dashboard from './pages/admin/Dashboard';
import Notifications from './pages/Notifications';

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
            
            <Route path="/notifications" element={<Notifications />} />
            {/* Tuyến đường được bảo vệ cho Admin */}
            <Route element={<ProtectedRoute allowedRoles={['ORGANIZER']} />}>
              <Route path="/admin" element={<Dashboard />} />
            </Route>

            {/* Task C2a: Scanner Placeholder */}
            <Route path="/scanner" element={
              <div style={{ padding: '40px', textAlign: 'center', color: '#111827' }}>
                <h2>📱 Ứng dụng Soát vé (Scanner PWA)</h2>
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