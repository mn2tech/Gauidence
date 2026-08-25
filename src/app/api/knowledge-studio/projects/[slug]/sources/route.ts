import { NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/knowledge-studio/projects/apiContext";
import { createSourceAndIngest } from "@/lib/knowledge-studio/projects/ingest";
import { validateAddSourceInput } from "@/lib/knowledge-studio/projects/validate";
import { assertAllowedDomainUrl } from "@/lib/knowledge-studio/normalize";

export const runtime = "nodejs";
export const maxDuration = 90;

type RouteContext = { params: Promise<{ slug: string }> };

/** Add a knowledge source and run initial ingest → needs_review. */
export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const ctx = await requireProjectAdmin(slug);
  if (ctx instanceof NextResponse) return ctx;

  const body = await request.json().catch(() => ({}));
  const validated = validateAddSourceInput(body, ctx.categorySlugs);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    assertAllowedDomainUrl(validated.value.source_url, ctx.allowedDomains);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Domain is not on the allowlist.",
      },
      { status: 400 }
    );
  }

  const category = ctx.loaded.categories.find(
    (c) => c.slug === validated.value.category
  );

  try {
    const result = await createSourceAndIngest({
      admin: ctx.admin,
      userId: ctx.user.id,
      projectId: ctx.loaded.project.id,
      categoryId: category?.id ?? null,
      input: {
        ...validated.value,
        authority:
          validated.value.authority ||
          ctx.loaded.project.authority_default ||
          undefined,
      },
      allowedDomains: ctx.allowedDomains,
      authorityDefault: ctx.loaded.project.authority_default ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      source: result.source,
      version: {
        id: result.version.id,
        version_number: result.version.version_number,
        status: result.version.status,
        change_summary: result.version.change_summary,
      },
      items_created: result.items_created,
      message:
        "Source ingested. Review extracted knowledge before publishing.",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not add source.";
    const status = /already exists/i.test(message)
      ? 409
      : /fetch|HTTP|extract|PDF|content type|allowlist|Invalid URL/i.test(
            message
          )
        ? 422
        : 500;
    console.error("Add knowledge source failed:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
