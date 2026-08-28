import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessSimpleHome } from "@/lib/features/simple-home";
import SimpleAppShell from "@/components/simple-home/SimpleAppShell";
import MyKnowledgeScreen from "@/components/personal-space/MyKnowledgeScreen";

export const metadata: Metadata = {
  title: "My Knowledge — Guardian",
  description: "What Guardian remembers about you.",
};

export default async function MyKnowledgePage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!canAccessSimpleHome({ email: user.email })) {
    redirect("/settings/knowledge");
  }

  return (
    <SimpleAppShell>
      <MyKnowledgeScreen />
    </SimpleAppShell>
  );
}
