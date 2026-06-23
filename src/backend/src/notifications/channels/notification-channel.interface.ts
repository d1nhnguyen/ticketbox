export interface NotificationPayload {
  userId: string;
  type: string;
  data: Record<string, any>;
}

export interface NotificationChannel {
  send(payload: NotificationPayload): Promise<void>;
}
