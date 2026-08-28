import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Suspense } from "react";
import UpdatePasswordForm from "@/components/UpdatePasswordForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Choose a new password — Guardian",
};

/**
 * Password reset form — session is established by /auth/recovery or
 * /auth/callback before landing here.
 */
export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    token_hash?: string;
    type?: string;
    error?: string;
    error_code?: string;
  }>;
}) {
  const params = await searchParams;

  if (params.error === "access_denied" && params.error_code === "otp_expired") {
    redirect("/login?error=reset_link_expired");
  }

  // Email links may still land here with a code — hand off to /auth/recovery.
  if (params.code || (params.token_hash && params.type === "recovery")) {
    const q = new URLSearchParams();
    if (params.code) q.set("code", params.code);
    if (params.token_hash) q.set("token_hash", params.token_hash);
    if (params.type) q.set("type", params.type);
    redirect(`/auth/recovery?${q.toString()}`);
  }

  if (!isSupabaseConfigured) {
    redirect("/login?error=not_configured");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <Suspense
          fallback={
            <p className="text-sm text-ink-muted">Loading password reset…</p>
          }
        >
          <UpdatePasswordForm />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
