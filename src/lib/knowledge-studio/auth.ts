import "server-only";

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/admin";

export type KnowledgeStudioAdminContext = {
  user: User;
  /** Service-role client (bypasses RLS). */
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
};

/**
 * Require a signed-in platform admin and a configured service-role client.
 * Never exposes the service role key to the client.
 */
export async function requireKnowledgeStudioAdmin(): Promise<
  KnowledgeStudioAdminContext | NextResponse
> {
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
  if (!isPlatformAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Admin database client is not configured." },
      { status: 503 }
    );
  }
  return { user, admin };
}
