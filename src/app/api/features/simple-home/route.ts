import { createClient } from "@/lib/supabase/server";
import { canAccessSimpleHome } from "@/lib/features/simple-home";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return Response.json({ enabled: false });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return Response.json({
    enabled: canAccessSimpleHome({ email: user?.email }),
  });
}
