import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
import { isEmployeeHubProfile } from "@/lib/employee-hub/routing";
import { canAccessSimpleHome } from "@/lib/features/simple-home";
import SimpleAppShell from "@/components/simple-home/SimpleAppShell";
import { getWorldInbox } from "@/lib/world/api";
import { WORLD_PATH } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Confirmations — My World — Guardian",
  description: "Things Guardian wants you to confirm about your world.",
};

/** Confirm / merge actions land in Sprint 3; Sprint 2 ships a read-only list. */
export default async function WorldInboxPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!canAccessSimpleHome({ email: user.email })) {
    redirect("/settings/profiles");
  }

  const active = await getActiveGuardianProfile(supabase, user);
  if (isEmployeeHubProfile(active)) {
    redirect("/employee");
  }

  let items: Awaited<ReturnType<typeof getWorldInbox>> = [];
  try {
    items = await getWorldInbox(supabase, user.id, { limit: 30 });
  } catch {
    items = [];
  }

  return (
    <SimpleAppShell>
      <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:py-8">
        <Link
          href={WORLD_PATH}
          className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> My World
        </Link>
        <div className="simple-home-card space-y-3 p-6">
          <h1 className="text-xl font-semibold tracking-tight">Confirmations</h1>
          <p className="text-sm text-ink-muted">
            When Guardian is unsure whether two people are the same, or wants
            you to confirm a connection, those items appear here.
          </p>
          {items.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Nothing to confirm right now. You&apos;re all caught up.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
                >
                  <p className="font-semibold text-foreground">
                    {String(item.type).replace(/_/g, " ")}
                  </p>
                  {item.reason ? (
                    <p className="mt-1 text-ink-muted">{item.reason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SimpleAppShell>
  );
}
