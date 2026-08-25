import { NextResponse } from "next/server";
import { requireKnowledgeStudioAdmin } from "@/lib/knowledge-studio/auth";
import { runParentIntelligenceTest } from "@/lib/mcps-parent/dashboard";
import { parseYmd } from "@/lib/mcps-parent/dates";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * Admin-only Parent Intelligence Test.
 * Body: { school_name, grade_level, as_of?: YYYY-MM-DD }
 */
export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const ctx = await requireKnowledgeStudioAdmin();
  if (ctx instanceof NextResponse) return ctx;

  if (slug !== "mcps-parent") {
    return NextResponse.json(
      { error: "Parent Intelligence Test is available for mcps-parent." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    school_name?: string;
    grade_level?: string;
    as_of?: string;
  };

  const schoolName =
    typeof body.school_name === "string" ? body.school_name.trim() : "";
  const gradeLevel =
    typeof body.grade_level === "string" ? body.grade_level.trim() : "";
  if (!schoolName || !gradeLevel) {
    return NextResponse.json(
      { error: "school_name and grade_level are required." },
      { status: 400 }
    );
  }

  const asOf =
    typeof body.as_of === "string" && body.as_of
      ? parseYmd(body.as_of) ?? new Date()
      : new Date();

  const result = await runParentIntelligenceTest({
    admin: ctx.admin,
    schoolName,
    gradeLevel,
    asOf,
  });

  return NextResponse.json({ ok: true, ...result });
}
