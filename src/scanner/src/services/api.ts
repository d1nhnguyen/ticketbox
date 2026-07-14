import axios from 'axios';
import { getToken, clearSession } from './session';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // 401 ngoài trang login = token hết hạn/không hợp lệ → xóa phiên, App quay về màn đăng nhập.
    // Không đụng vào Dexie: hàng đợi scan PENDING phải sống qua re-login.
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      clearSession();
      window.dispatchEvent(new Event('auth-expired'));
    }
    return Promise.reject(error);
  },
);

// ---- Typed API helpers ----

export interface ConcertSummary {
  id: string;
  title: string;
  slug: string;
  venue: string;
  startsAt: string;
  status: string;
}

export interface ValidTicketDto {
  ticketId: string;
  qrCode: string;
}

export interface GuestDto {
  id: string;
  fullName: string;
  docId: string | null;
  zone: string;
  status: 'INVITED' | 'CHECKED_IN';
}

export interface ScanDto {
  clientLogId: string;
  ticketId: string;
  deviceId: string;
  scannedAt: string;
}

export interface SyncResult {
  ticketId: string;
  clientLogId: string;
  result: 'ACCEPTED' | 'DUPLICATE' | 'ALREADY_SYNCED';
}

export interface GuestCheckinResult {
  ok: boolean;
  alreadyCheckedIn: boolean;
}

export async function login(email: string, password: string): Promise<string> {
  const res = await api.post<{ access_token: string }>('/auth/login', { email, password });
  return res.data.access_token;
}

export async function fetchConcerts(): Promise<ConcertSummary[]> {
  const res = await api.get<ConcertSummary[]>('/concerts');
  return res.data;
}

export async function fetchValidTickets(concertId: string): Promise<ValidTicketDto[]> {
  const res = await api.get<ValidTicketDto[]>(`/concerts/${concertId}/tickets/valid`);
  return res.data;
}

export async function fetchGuests(concertId: string): Promise<GuestDto[]> {
  const res = await api.get<GuestDto[]>(`/concerts/${concertId}/guests`);
  return res.data;
}

export async function postCheckinSync(scans: ScanDto[]): Promise<SyncResult[]> {
  const res = await api.post<SyncResult[]>('/checkin/sync', { scans });
  return res.data;
}

export async function postGuestCheckin(guestId: string): Promise<GuestCheckinResult> {
  const res = await api.post<GuestCheckinResult>('/guests/check-in', { guestId });
  return res.data;
}
