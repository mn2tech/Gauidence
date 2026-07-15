import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Log in — Guardian",
};

export default async function LoginPage() {
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
