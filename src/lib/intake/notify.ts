import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { appBaseUrl } from "@/lib/profiles/invitations";
import { sendIntakeSubmittedEmail } from "@/lib/email";
import { getIntakeEmployeeName } from "./external";

export async function notifyIntakeSubmitted(
  admin: SupabaseClient,
  args: {
    businessProfileId: string;
    employeeProfileId: string;
    recipientName: string | null;
    requestId: string;
  }
): Promise<void> {
  const employeeName = await getIntakeEmployeeName(admin, args.employeeProfileId);
  const displayName = args.recipientName?.trim() || employeeName;

  const adminClient = createAdminClient();
  if (!adminClient) return;

  const { data: members } = await adminClient
    .from("guardian_profile_members")
    .select("user_id")
    .eq("profile_id", args.businessProfileId);

  const memberIds = (members ?? []).map((m) => String(m.user_id));

  if (memberIds.length === 0) return;

  const { data: recipients } = await adminClient
    .from("profiles")
    .select("email")
    .in("id", memberIds);

  const openUrl = `${appBaseUrl()}/dashboard`;

  for (const recipient of recipients ?? []) {
    const email = recipient.email as string | null;
    if (!email) continue;
    await sendIntakeSubmittedEmail({
      to: email,
      contractorName: displayName,
      openUrl,
    });
  }
}
