import { NextResponse } from "next/server";
import { getExpertPublicById } from "@/lib/experts/load-expert";
import {
  isExpertAuthed,
  recordExpertActivity,
  requireExpertUser,
  requireOwnedUserExpert,
  touchUserExpertOpened,
} from "@/lib/experts/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ userExpertId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireExpertUser();
  if (!isExpertAuthed(auth)) return auth;

  const { userExpertId } = await context.params;
  const installation = await requireOwnedUserExpert(
    auth.supabase,
    auth.user.id,
    userExpertId
  );
  if (!installation) {
    return NextResponse.json({ error: "Expert installation not found." }, { status: 404 });
  }

  const expert = getExpertPublicById(installation.expert_id);
  if (!expert) {
    return NextResponse.json({ error: "Expert definition unavailable." }, { status: 404 });
  }

  const [{ data: progress }, { data: activity }, { data: quizAttempts }] =
    await Promise.all([
      auth.supabase
        .from("expert_module_progress")
        .select("*")
        .eq("user_expert_id", installation.id)
        .order("updated_at", { ascending: false }),
      auth.supabase
        .from("expert_activity")
        .select("id, activity_type, content_id, metadata, created_at")
        .eq("user_expert_id", installation.id)
        .order("created_at", { ascending: false })
        .limit(20),
      auth.supabase
        .from("expert_quiz_attempts")
        .select("quiz_id, score, completed_at")
        .eq("user_expert_id", installation.id)
        .order("completed_at", { ascending: false }),
    ]);

  await touchUserExpertOpened(auth.supabase, auth.user.id, installation.id);
  await recordExpertActivity(auth.supabase, {
    userId: auth.user.id,
    userExpertId: installation.id,
    activityType: "expert_opened",
    contentId: installation.expert_id,
  });

  return NextResponse.json({
    installation,
    expert,
    progress: progress ?? [],
    activity: activity ?? [],
    quizAttempts: quizAttempts ?? [],
  });
}
