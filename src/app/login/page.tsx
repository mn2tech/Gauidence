import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
import { signedInLandingPath } from "@/lib/simple-home/routing";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Log in — Guardian",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const supabase = await createClient();
  let defaultNext = "/ask";
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const active = await getActiveGuardianProfile(supabase, user);
      defaultNext = signedInLandingPath(active, { email: user.email });
    }
  }

  const params = await searchParams;
  const rawNext = params.next;
  const safeNext =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : defaultNext;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect(safeNext);
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
