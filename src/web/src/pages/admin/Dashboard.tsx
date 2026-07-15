import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Wallet, Ticket, CalendarDays, ScanLine } from 'lucide-react';
import apiClient from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { CHART_COLORS, CHART_GRID, CHART_AXIS } from '../../lib/chartTheme';

interface Overview {
  totals: {
    totalRevenue: number;
    ticketsSold: number;
    totalOrders: number;
    totalConcerts: number;
    checkedInCount: number;
  };
  salesByDay: { date: string; tickets: number; revenue: number }[];
  ticketTypeBreakdown: { ticketTypeId: string; name: string; concertTitle: string; soldQty: number; revenue: number }[];
  concerts: { id: string; title: string; startsAt: string; status: string; capacity: number; ticketsSold: number; revenue: number }[];
}

const formatVnd = (n: number) => n.toLocaleString('vi-VN') + ' VNĐ';
const formatCompactVnd = (n: number) => {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' tr';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' k';
  return String(n);
};
const formatDay = (isoDate: string) => {
  const d = new Date(isoDate);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function SalesTooltip({ active, payload, label, mode }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return (
    <div className="card" style={{ padding: '8px 12px', boxShadow: 'var(--shadow-md)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700, color: 'var(--text)' }}>
        {mode === 'revenue' ? formatVnd(value) : `${value} vé`}
      </div>
    </div>
  );
}

function TicketTypeTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="card" style={{ padding: '8px 12px', boxShadow: 'var(--shadow-md)' }}>
      <div style={{ fontWeight: 700, color: 'var(--text)' }}>{d.name}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{d.concertTitle}</div>
      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{d.soldQty} vé · {formatVnd(d.revenue)}</div>
    </div>
  );
}

export default function Dashboard() {
  const { token } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<'tickets' | 'revenue'>('tickets');

  useEffect(() => {
    apiClient
      .get<Overview>('/admin/stats/overview', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setOverview(res.data))
      .catch((err) => console.error('Lỗi tải thống kê:', err))
      .finally(() => setLoading(false));
  }, [token]);

  const topTicketTypes = useMemo(() => {
    if (!overview) return [];
    const sorted = [...overview.ticketTypeBreakdown].sort((a, b) => b.soldQty - a.soldQty);
    if (sorted.length <= 8) return sorted;
    const top = sorted.slice(0, 7);
    const rest = sorted.slice(7);
    const other = {
      ticketTypeId: '__other__',
      name: 'Khác',
      concertTitle: `${rest.length} loại vé khác`,
      soldQty: rest.reduce((s, r) => s + r.soldQty, 0),
      revenue: rest.reduce((s, r) => s + r.revenue, 0),
    };
    return [...top, other];
  }, [overview]);

  if (loading) {
    return (
      <div className="empty-state">
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        Đang tải dữ liệu thống kê...
      </div>
    );
  }

  if (!overview) {
    return <div className="alert alert-danger">Không thể tải dữ liệu thống kê. Vui lòng thử lại.</div>;
  }

  const { totals, salesByDay, concerts } = overview;
  const checkinRate = totals.ticketsSold > 0 ? Math.round((totals.checkedInCount / totals.ticketsSold) * 100) : 0;
  const totalTicketTypeQty = topTicketTypes.reduce((s, t) => s + t.soldQty, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Tổng quan</div>
          <div className="page-subtitle">Báo cáo doanh thu và tình hình bán vé toàn hệ thống</div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">
            <span className="stat-icon"><Wallet size={16} /></span>
            Tổng doanh thu
          </span>
          <span className="stat-value">{formatCompactVnd(totals.totalRevenue)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">
            <span className="stat-icon"><Ticket size={16} /></span>
            Vé đã bán
          </span>
          <span className="stat-value">{totals.ticketsSold.toLocaleString('vi-VN')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">
            <span className="stat-icon"><CalendarDays size={16} /></span>
            Tổng sự kiện
          </span>
          <span className="stat-value">{totals.totalConcerts}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">
            <span className="stat-icon"><ScanLine size={16} /></span>
            Tỷ lệ check-in
          </span>
          <span className="stat-value">{checkinRate}%</span>
        </div>
      </div>

      <div className="dashboard-charts-grid">
        <div className="card">
          <div className="card-header card-header-wrap">
            <h2 style={{ fontSize: 16 }}>Vé bán theo ngày (30 ngày qua)</h2>
            <div className="tabs" style={{ border: 'none', margin: 0 }}>
              <button
                className={`tab${chartMode === 'tickets' ? ' active' : ''}`}
                onClick={() => setChartMode('tickets')}
              >
                Vé
              </button>
              <button
                className={`tab${chartMode === 'revenue' ? ' active' : ''}`}
                onClick={() => setChartMode('revenue')}
              >
                Doanh thu
              </button>
            </div>
          </div>
          <div className="card-body">
            {salesByDay.every((d) => d.tickets === 0) ? (
              <div className="empty-state">Chưa có vé nào được bán trong khoảng thời gian này.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={salesByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART_GRID} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDay}
                    stroke={CHART_AXIS}
                    tick={{ fontSize: 12, fill: CHART_AXIS }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke={CHART_AXIS}
                    tick={{ fontSize: 12, fill: CHART_AXIS }}
                    axisLine={false}
                    tickLine={false}
                    width={chartMode === 'revenue' ? 56 : 32}
                    tickFormatter={chartMode === 'revenue' ? (v) => formatCompactVnd(Number(v)) : undefined}
                  />
                  <Tooltip content={<SalesTooltip mode={chartMode} />} cursor={{ fill: 'var(--surface-2)' }} />
                  <Bar dataKey={chartMode} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 style={{ fontSize: 16 }}>Cơ cấu loại vé</h2>
          </div>
          <div className="card-body">
            {topTicketTypes.length === 0 ? (
              <div className="empty-state">Chưa có dữ liệu bán vé.</div>
            ) : (
              <>
                <div style={{ position: 'relative' }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={topTicketTypes}
                        dataKey="soldQty"
                        nameKey="name"
                        innerRadius="60%"
                        outerRadius="85%"
                        paddingAngle={2}
                        stroke="var(--surface)"
                        strokeWidth={2}
                      >
                        {topTicketTypes.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<TicketTypeTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    textAlign: 'center', pointerEvents: 'none',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{totalTicketTypeQty}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>vé</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  {topTicketTypes.map((t, i) => (
                    <div key={t.ticketTypeId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                        background: CHART_COLORS[i % CHART_COLORS.length],
                      }} />
                      <span style={{ color: 'var(--text)', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.name}
                      </span>
                      <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{t.soldQty} vé</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 style={{ fontSize: 16 }}>Sự kiện</h2>
          <Link to="/admin/concerts" className="btn btn-secondary btn-sm">Xem tất cả</Link>
        </div>
        <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Sự kiện</th>
                <th>Ngày diễn ra</th>
                <th style={{ textAlign: 'center' }}>Trạng thái</th>
                <th>Vé đã bán</th>
                <th style={{ textAlign: 'right' }}>Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {concerts.map((c) => {
                const pct = c.capacity > 0 ? Math.min(100, Math.round((c.ticketsSold / c.capacity) * 100)) : 0;
                return (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/admin/concerts/${c.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>
                        {c.title}
                      </Link>
                    </td>
                    <td>{new Date(c.startsAt).toLocaleDateString('vi-VN')}</td>
                    <td style={{ textAlign: 'center' }}>
                      {c.status === 'ON_SALE' && <span className="badge badge-success">Đang mở bán</span>}
                      {c.status === 'CANCELLED' && <span className="badge badge-danger">Đã hủy</span>}
                      {c.status === 'DRAFT' && <span className="badge badge-muted">Bản nháp</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="progress" style={{ maxWidth: 100 }}>
                          <div className="progress-bar" style={{ width: `${pct}%` }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                          {c.ticketsSold}/{c.capacity}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatVnd(c.revenue)}</td>
                  </tr>
                );
              })}
              {concerts.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">Chưa có sự kiện nào.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
