/**
 * Shared Axios instance — mọi request đến backend đều dùng file này.
 * Base URL lấy từ biến môi trường VITE_API_URL (xem .env.example).
 * Mặc định fallback về http://localhost:3000 khi dev local.
 */
import axios from 'axios';

export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

export default apiClient;
