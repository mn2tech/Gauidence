import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessSimpleHome } from "@/lib/features/simple-home";
import SimpleAppShell from "@/components/simple-home/SimpleAppShell";
import AddAnythingScreen from "@/components/add-anything/AddAnythingScreen";

export const metadata: Metadata = {
  title: "Add Anything — Guardian",
  description: "Add documents, photos, or text — Guardian organizes them for you.",
};

export default async function AddPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!canAccessSimpleHome({ email: user.email })) {
    redirect("/dashboard?camera=1");
  }

  return (
    <SimpleAppShell>
      <AddAnythingScreen />
    </SimpleAppShell>
  );
}
