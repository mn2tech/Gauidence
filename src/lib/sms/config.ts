/** SMS is implemented but disabled until Twilio is ready to ship. */
export function smsNotificationsEnabled(): boolean {
  return process.env.SMS_NOTIFICATIONS_ENABLED === "true";
}
