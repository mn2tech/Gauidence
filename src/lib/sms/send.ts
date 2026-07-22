import "server-only";

import { smsNotificationsEnabled } from "@/lib/sms/config";
import { isValidPhoneE164 } from "@/lib/sms/phone";

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!smsNotificationsEnabled()) return false;

  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!sid || !token || !from || !isValidPhoneE164(to)) return false;

  const text = body.trim().slice(0, 320);
  if (!text) return false;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: text }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Twilio SMS failed:", res.status, detail.slice(0, 200));
    return false;
  }
  return true;
}
