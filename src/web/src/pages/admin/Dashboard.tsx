export default function Dashboard() {
  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px' }}>
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '30px' }}>
        <h1 style={{ color: '#b91c1c', marginBottom: '10px' }}>⚙️ Admin Dashboard</h1>
        <p style={{ color: '#991b1b', fontSize: '1.1rem' }}>Bạn đã vượt qua Route Guard. Khu vực này chỉ dành cho tài khoản ORGANIZER.</p>
      </div>
    </div>
  );
}