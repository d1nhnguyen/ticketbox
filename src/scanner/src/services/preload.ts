import { db } from '../db/db';
import { fetchValidTickets, fetchGuests } from './api';
import type { SelectedConcert } from './session';

export interface SnapshotInfo {
  ticketCount: number;
  guestCount: number;
}

// Tải snapshot vé hợp lệ + khách mời của concert đã chọn từ backend.
// Chỉ thay dữ liệu của đúng concert đó, trong MỘT transaction — không đụng
// scanQueue/guestCheckinQueue (dữ liệu offline đang chờ sync phải được giữ nguyên).
export async function downloadSnapshot(concert: SelectedConcert): Promise<SnapshotInfo> {
  const [tickets, guests] = await Promise.all([
    fetchValidTickets(concert.id),
    fetchGuests(concert.id),
  ]);

  await db.transaction(
    'rw',
    db.validTickets,
    db.guests,
    db.guestCheckinQueue,
    db.meta,
    async () => {
      const pendingGuestIds = new Set(
        (
          await db.guestCheckinQueue
            .where('syncStatus')
            .equals('PENDING')
            .filter((record) => record.concertId === concert.id)
            .toArray()
        ).map((record) => record.guestId),
      );

      await db.validTickets.where('concertId').equals(concert.id).delete();
      await db.guests.where('concertId').equals(concert.id).delete();

      // Backend chỉ trả {ticketId, qrCode} / guest không kèm concertId → gắn concertId phía client.
      await db.validTickets.bulkPut(tickets.map((t) => ({ ...t, concertId: concert.id })));
      await db.guests.bulkPut(
        guests.map((guest) => ({
          ...guest,
          concertId: concert.id,
          // Server có thể vẫn trả INVITED khi check-in offline chưa kịp đồng bộ.
          status: pendingGuestIds.has(guest.id) ? 'CHECKED_IN' as const : guest.status,
        })),
      );

      await db.meta.put({
        key: `snapshot:${concert.id}`,
        concertId: concert.id,
        downloadedAt: new Date().toISOString(),
        ticketCount: tickets.length,
        guestCount: guests.length,
      });
    },
  );

  return { ticketCount: tickets.length, guestCount: guests.length };
}
