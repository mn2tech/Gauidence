import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGuardianWatch } from "@/lib/guardian-items/watch";
import { loadEligibleSourceStatuses } from "@/lib/guardian-today/backfill";
import { deriveCoverage } from "@/lib/guardian-today/coverage";
import { buildIntelligenceDiagnostic } from "@/lib/guardian-today/diagnostics";
import { guardianPriorityToIntelligence, scoreWatchItem } from "@/lib/guardian-today/scoring";
import { calendarDateInUserZone } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/timezone/server";

export const runtime = "nodejs";

/**
 * Admin/dev diagnostic for Guardian intelligence pipeline.
 * Not shown to normal users on /home.
 */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: memberships } = await supabase
    .from("guardian_profile_members")
    .select("profile_id")
    .eq("user_id", user.id);
  const spaceIds = [
    ...new Set((memberships ?? []).map((m) => m.profile_id as string)),
  ];

  const timeZone = await getUserTimeZone(supabase, user.id);
  const now = new Date();
  const today = calendarDateInUserZone(now, timeZone);

  const [watch, sources, itemsCount] = await Promise.all([
    getGuardianWatch(supabase, user.id, { now }),
    loadEligibleSourceStatuses(supabase, spaceIds),
    supabase
      .from("guardian_items")
      .select("id", { count: "exact", head: true })
      .in("space_id", spaceIds.length ? spaceIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("status", "active")
      .then((r) => r.count ?? 0),
  ]);

  const evaluated = [
    ...watch.today,
    ...watch.needsAttention,
    ...watch.comingUp,
    ...watch.later,
  ];

  const priorityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const item of evaluated) {
    const scored = scoreWatchItem({ item, today, now });
    const band = guardianPriorityToIntelligence(scored.resolvedPriority);
    priorityCounts[band] += 1;
  }

  const coverage = deriveCoverage({
    spaceIds,
    sources,
    activeItemCount: itemsCount,
    lastWatchEvaluationAt: now.toISOString(),
  });

  const diagnostic = buildIntelligenceDiagnostic({
    coverage,
    evaluatedItemCount: evaluated.length,
    priorityCounts,
  });

  return NextResponse.json({
    title: "Guardian Intelligence Diagnostic",
    diagnostic,
    text: [
      `Accessible Spaces: ${diagnostic.accessibleSpaces}`,
      `Sources discovered: ${diagnostic.sourcesDiscovered}`,
      `Sources processed: ${diagnostic.sourcesProcessed}`,
      `Sources pending: ${diagnostic.sourcesPending}`,
      `Sources failed: ${diagnostic.sourcesFailed}`,
      "",
      `guardian_items generated: ${diagnostic.guardianItemsGenerated}`,
      "",
      `Watch Engine evaluated: ${diagnostic.watchEngineEvaluated}`,
      "",
      `Critical: ${diagnostic.byPriority.critical}`,
      `High: ${diagnostic.byPriority.high}`,
      `Medium: ${diagnostic.byPriority.medium}`,
      `Low: ${diagnostic.byPriority.low}`,
      "",
      `Pipeline status: ${diagnostic.pipelineStatus}`,
      `Last successful evaluation:`,
      diagnostic.lastSuccessfulEvaluation ?? "(none)",
    ].join("\n"),
  });
}
