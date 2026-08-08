import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessSimpleHome } from "@/lib/features/simple-home";
import SimpleAppShell from "@/components/simple-home/SimpleAppShell";
import RememberTodayScreen from "@/components/remember-today/RememberTodayScreen";

export const metadata: Metadata = {
  title: "Remember Today — Guardian",
  description: "Capture what happened today — Guardian remembers and organizes it.",
};

export default async function RememberPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!canAccessSimpleHome({ email: user.email })) {
    redirect("/dashboard?docs=1");
  }

  return (
    <SimpleAppShell>
      <RememberTodayScreen />
    </SimpleAppShell>
  );
}
