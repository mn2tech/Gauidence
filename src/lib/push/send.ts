import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { appBaseUrl } from "@/lib/profiles/invitations";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

function configureVapid(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:support@nm2tech.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<number> {
  if (!configureVapid()) return 0;

  const admin = createAdminClient();
  if (!admin) return 0;

  const { data: profile } = await admin
    .from("profiles")
    .select("push_notifications_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.push_notifications_enabled === false) return 0;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", userId);

  if (!subs?.length) return 0;

  const base = appBaseUrl();
  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url?.startsWith("http") ? payload.url : `${base}${payload.url ?? "/dashboard"}`,
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        },
        message
      );
      sent += 1;
    } catch (err) {
      const status = err && typeof err === "object" && "statusCode" in err
        ? Number((err as { statusCode: number }).statusCode)
        : 0;
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      }
      console.error(
        "Push send failed:",
        err instanceof Error ? err.message : "error"
      );
    }
  }
  return sent;
}
