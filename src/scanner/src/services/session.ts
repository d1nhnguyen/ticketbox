// Quản lý phiên đăng nhập scanner: token JWT, concert đã chọn và deviceId ổn định.
// Lưu trong localStorage để app mở lại được khi offline (JWT stateless — kiểm tra exp cục bộ,
// không gọi server xác thực lại; nếu token hết hạn giữa ca offline thì scan vẫn được queue,
// lần sync online đầu tiên trả 401 → đăng nhập lại → dữ liệu queue được sync tiếp).

const TOKEN_KEY = 'scanner_token';
const CONCERT_KEY = 'scanner_concert';
const DEVICE_ID_KEY = 'scanner_device_id';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  exp: number;
}

export interface SelectedConcert {
  id: string;
  title: string;
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

// Chỉ xóa token — concert đã chọn và deviceId phải sống qua logout/re-login.
export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getSession(): { email: string; role: string } | null {
  const token = getToken();
  if (!token) return null;

  const payload = decodeJwt(token);
  if (!payload || payload.exp * 1000 <= Date.now()) {
    clearSession();
    return null;
  }
  return { email: payload.email, role: payload.role };
}

export function getSelectedConcert(): SelectedConcert | null {
  const raw = localStorage.getItem(CONCERT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(CONCERT_KEY);
    return null;
  }
}

export function setSelectedConcert(concert: SelectedConcert): void {
  localStorage.setItem(CONCERT_KEY, JSON.stringify(concert));
}

// Device ID ổn định: sinh một lần, tái sử dụng cho mọi lượt quét từ thiết bị này.
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
