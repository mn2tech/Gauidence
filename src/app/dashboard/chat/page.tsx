import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VaultChatPanel from "@/components/VaultChatPanel";

export const metadata: Metadata = {
  title: "Ask your vault — Guardian",
  description:
    "Ask questions across your analyzed documents. Answers cite source files from your private vault.",
};

export default async function VaultChatPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <VaultChatPanel variant="page" />;
}
