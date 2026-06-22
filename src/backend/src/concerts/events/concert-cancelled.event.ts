export const CONCERT_CANCELLED_EVENT = 'concert.cancelled';

export class ConcertCancelledEvent {
  constructor(
    public readonly concertId: string,
    public readonly title: string,
    public readonly buyerUserIds: string[],
  ) {}
}
