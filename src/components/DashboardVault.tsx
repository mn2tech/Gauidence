"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import DocumentManager from "@/components/DocumentManager";
import AlertsPanel from "@/components/AlertsPanel";
import DailyLogPanel from "@/components/DailyLogPanel";
import LinkedEmployeesPanel from "@/components/LinkedEmployeesPanel";
import { useActiveProfile } from "@/components/ProfileProvider";
import { canHaveLinkedEmployees, vaultLabel } from "@/lib/profiles/types";

export default function DashboardVault({ userId }: { userId: string }) {
  const router = useRouter();
  const { active, loading } = useActiveProfile();

  useEffect(() => {
    const onChange = () => router.refresh();
    window.addEventListener("guardian:profile-changed", onChange);
    return () => window.removeEventListener("guardian:profile-changed", onChange);
  }, [router]);

  if (loading && !active) {
    return (
      <p className="text-sm text-ink-muted">Loading profile vault…</p>
    );
  }
  if (!active) {
    return (
      <p className="text-sm text-ink-muted">
        No active profile. Open Manage Profiles to continue.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-muted">{vaultLabel(active)}</p>
      <AlertsPanel profileId={active.id} />
      {canHaveLinkedEmployees(active.profile_type) && (
        <LinkedEmployeesPanel parent={active} />
      )}
      <DailyLogPanel
        profileId={active.id}
        profileName={active.display_name}
        profileType={active.profile_type}
      />
      <DocumentManager
        userId={userId}
        profileId={active.id}
        profileName={active.display_name}
      />
      <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-5">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <p className="text-sm leading-relaxed text-ink-muted">
          Documents and Daily Logs belong only to the active profile. Switch
          profiles above or from the header to change context.
        </p>
      </div>
    </div>
  );
}
