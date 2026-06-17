import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = (role: 'AUDIENCE' | 'ORGANIZER' | 'SCANNER') => {
    login(role);
    if (role === 'ORGANIZER') {
      navigate('/admin');
    } else if (role === 'SCANNER') {
      navigate('/scanner'); 
    } else {
      navigate('/');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Đăng nhập giả lập (Mock Login)</h2>
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <button onClick={() => handleLogin('AUDIENCE')}>Khán giả</button>
        <button onClick={() => handleLogin('ORGANIZER')}>Ban Tổ Chức</button>
        <button onClick={() => handleLogin('SCANNER')}>Soát Vé</button>
      </div>
    </div>
  );
}