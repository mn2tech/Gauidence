import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import UpdatePasswordForm from "@/components/UpdatePasswordForm";

export const metadata: Metadata = {
  title: "Choose a new password — Guardian",
};

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  if (!supabase) {
    redirect("/login?error=not_configured");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/forgot-password");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <UpdatePasswordForm />
      </main>
      <SiteFooter />
    </div>
  );
}
