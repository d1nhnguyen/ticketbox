import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import { AuthProvider } from './hooks/useAuth';
import { PaymentMethodsProvider } from './hooks/usePaymentMethods';
import { ProtectedRoute } from './components/ProtectedRoute';
import NotFound from './components/NotFound';
import { AuthLayout } from './layouts/AuthLayout';
import { AudienceLayout } from './layouts/AudienceLayout';
import { AdminLayout } from './layouts/AdminLayout';

// Import Pages
import Home from './pages/Home';
import Login from './pages/Login';
import ConcertDetail from './pages/ConcertDetail';
import OrderSuccess from './pages/OrderSuccess';
import AudienceDashboard from './pages/AudienceDashboard';
import Dashboard from './pages/admin/Dashboard';
import Concerts from './pages/admin/Concerts';
import AiBioUpload from './pages/admin/AiBioUpload';
import CsvUpload from './pages/admin/CsvUpload';
import AdminConcertDetail from './pages/admin/AdminConcertDetail';
import Notifications from './pages/Notifications';
import VNPayReturn from './pages/VNPayReturn';
import Register from './pages/Register';

const SCANNER_URL: string = import.meta.env.VITE_SCANNER_URL ?? 'http://localhost:5174';

function ScannerLink() {
  return (
    <div className="card empty-state" style={{ maxWidth: 480, margin: '60px auto', padding: '40px 32px' }}>
      <Smartphone className="empty-state-icon" size={40} />
      <h2 style={{ marginBottom: 10 }}>Ứng dụng Soát vé (Scanner PWA)</h2>
      <p style={{ marginBottom: 24 }}>
        Ứng dụng soát vé chạy như một PWA riêng biệt để hỗ trợ chế độ offline.
      </p>
      <a href={SCANNER_URL} className="btn btn-primary">
        Mở ứng dụng Scanner
      </a>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PaymentMethodsProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
            </Route>

            <Route element={<AudienceLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/concert/:slug" element={<ConcertDetail />} />
              <Route path="/orders/:id/success" element={<OrderSuccess />} />
              <Route path="/vnpay-return" element={<VNPayReturn />} />
              <Route path="/scanner" element={<ScannerLink />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<AudienceDashboard />} />
                <Route path="/notifications" element={<Notifications />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['ORGANIZER']} />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<Dashboard />} />
                <Route path="/admin/concerts" element={<Concerts />} />
                <Route path="/admin/concerts/:id" element={<AdminConcertDetail />} />
                <Route path="/admin/ai-bio" element={<AiBioUpload />} />
                <Route path="/admin/csv-upload" element={<CsvUpload />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </PaymentMethodsProvider>
    </AuthProvider>
  );
}
