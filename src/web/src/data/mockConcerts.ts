export const mockConcerts = [
  {
    id: '1',
    title: 'Anh Trai Say Hi',
    slug: 'anh-trai-say-hi',
    venue: 'SVĐ Mỹ Đình, Hà Nội',
    startsAt: '2026-08-15T19:00:00Z',
    status: 'ON_SALE',
    ticketTypes: [
      { id: 't1', name: 'SVIP', price: 5000000, remainingQty: 200 },
      { id: 't2', name: 'VIP', price: 3000000, remainingQty: 1000 },
      { id: 't3', name: 'CAT1', price: 2000000, remainingQty: 5000 },
      { id: 't4', name: 'CAT2', price: 1200000, remainingQty: 8000 },
      { id: 't5', name: 'GA', price: 800000, remainingQty: 15000 }
    ]
  },
  {
    id: '2',
    title: 'Chị Đẹp Đạp Gió Rẽ Sóng',
    slug: 'chi-dep-dap-gio',
    venue: 'Nhà thi đấu Phú Thọ, TP.HCM',
    startsAt: '2026-09-20T19:00:00Z',
    status: 'ON_SALE',
    ticketTypes: [
      { id: 't6', name: 'VIP', price: 4000000, remainingQty: 500 },
      { id: 't7', name: 'GA', price: 1000000, remainingQty: 10000 }
    ]
  }
];