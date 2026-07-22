import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { awardByKey, type AwardKey } from "@/lib/awards/definitions";
import { sendAwardEarnedEmail } from "@/lib/awards/email";
import { sendPushToUser } from "@/lib/push/send";
import { sendSms } from "@/lib/sms/send";
import { appBaseUrl } from "@/lib/profiles/invitations";

function firstName(fullName: string | null | undefined, email: string): string {
  const fromName = fullName?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  return email.split("@")[0]?.trim() || "there";
}

/**
 * Email, push, and SMS when a user earns an award (once per award).
 */
export async function notifyAwardsEarned(
  userId: string,
  awardKeys: AwardKey[]
): Promise<void> {
  if (awardKeys.length === 0) return;

  const admin = createAdminClient();
  if (!admin) return;

  const { data: profile } = await admin
    .from("profiles")
    .select(
      "email, full_name, email_tips_enabled, sms_notifications_enabled, phone_e164"
    )
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.email) return;

  const name = firstName(profile.full_name, profile.email);
  const tipsOn = profile.email_tips_enabled !== false;
  const smsOn =
    profile.sms_notifications_enabled === true &&
    typeof profile.phone_e164 === "string" &&
    profile.phone_e164.length > 0;

  for (const key of awardKeys) {
    const { data: row } = await admin
      .from("user_awards")
      .select("notify_sent_at")
      .eq("user_id", userId)
      .eq("award_key", key)
      .maybeSingle();

    if (row?.notify_sent_at) continue;

    const award = awardByKey(key);
    let delivered = false;

    if (tipsOn) {
      delivered = await sendAwardEarnedEmail(profile.email, key, name);
    }

    const pushCount = await sendPushToUser(userId, {
      title: "Award earned",
      body: `${award.title} — ${award.description}`,
      url: "/dashboard",
    });
    if (pushCount > 0) delivered = true;

    if (smsOn) {
      const smsOk = await sendSms(
        profile.phone_e164!,
        `Guardian: You earned "${award.title}"! ${award.description} Open ${appBaseUrl()}/dashboard`
      );
      if (smsOk) delivered = true;
    }

    if (delivered || pushCount > 0) {
      await admin
        .from("user_awards")
        .update({ notify_sent_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("award_key", key);
    }
  }
}
