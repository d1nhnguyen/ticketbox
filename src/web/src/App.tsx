import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';

import Home from './pages/Home';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import ConcertDetail from './pages/ConcertDetail';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/concert/:slug" element={<ConcertDetail />} />
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute allowedRoles={['ORGANIZER']} />}>
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>

          <Route path="*" element={<div>404 - Không tìm thấy trang</div>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;