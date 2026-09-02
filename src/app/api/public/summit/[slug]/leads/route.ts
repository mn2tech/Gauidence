import { NextResponse } from "next/server";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * Public lead capture for summit spaces — no registration wall.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    company?: string;
    email?: string;
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const company =
    typeof body.company === "string" ? body.company.trim() : null;
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!name || !email) {
    return NextResponse.json(
      { error: "Name and email are required" },
      { status: 400 }
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const supabase = createAnonServerClient() ?? (await createClient());
  if (!supabase) {
    return NextResponse.json(
      { error: "Guardian is not configured" },
      { status: 503 }
    );
  }

  const { error } = await supabase.from("summit_leads").insert({
    summit_slug: slug,
    name,
    company,
    email,
  });

  if (error) {
    console.error("Summit lead insert failed:", error.message);
    return NextResponse.json(
      { error: "Could not save your information" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
