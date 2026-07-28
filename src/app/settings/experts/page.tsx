import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import AdminExpertsSettings from "@/components/admin/AdminExpertsSettings";
import { isPlatformAdmin } from "@/lib/admin";
import { getExpertCatalog } from "@/lib/experts/load-expert";

export const metadata: Metadata = {
  title: "Manage expert access — Guardian",
};

export default async function AdminExpertsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isPlatformAdmin(user.email)) redirect("/settings");

  const experts = getExpertCatalog()
    .filter((e) => e.effectiveStatus !== "unavailable")
    .map(({ validationError: _validationError, effectiveStatus: _effectiveStatus, ...item }) => item);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-14">
          <p className="text-sm font-medium text-ink-muted">
            <Link href="/settings" className="text-brand hover:underline">
              Settings
            </Link>
            {" · Admin"}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Manage expert access</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Grant, assign, view, and revoke who can see restricted experts. Users still
            need Experts access via{" "}
            <code className="text-xs">GUARDIAN_EXPERTS_FLAG</code>.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            <span className="font-medium text-foreground">Restricted</span> experts are
            hidden until you grant access.{" "}
            <span className="font-medium text-foreground">Public</span> experts appear for
            everyone with Experts access.
          </p>

          <div className="mt-8">
            <AdminExpertsSettings experts={experts} />
          </div>

          <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-ink-muted">
            <p className="font-medium text-foreground">Available experts</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {experts.map((expert) => (
                <li key={expert.id}>
                  <span className="font-medium text-foreground">{expert.name}</span>
                  {" — "}
                  {expert.description}
                  {expert.visibility === "public" ? (
                    <span className="text-ink-muted"> (public)</span>
                  ) : (
                    <span className="text-ink-muted"> (restricted)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
