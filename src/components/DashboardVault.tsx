"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, ShieldCheck } from "lucide-react";
import DocumentManager from "@/components/DocumentManager";
import AlertsPanel from "@/components/AlertsPanel";
import DailyLogPanel from "@/components/DailyLogPanel";
import LinkedEmployeesPanel from "@/components/LinkedEmployeesPanel";
import LinkedClientsPanel from "@/components/LinkedClientsPanel";
import LinkedFamilyPanel from "@/components/LinkedFamilyPanel";
import LinkedVehiclesPanel from "@/components/LinkedVehiclesPanel";
import LinkedHomesPanel from "@/components/LinkedHomesPanel";
import LinkedPetsPanel from "@/components/LinkedPetsPanel";
import LinkedStudentsPanel from "@/components/LinkedStudentsPanel";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import VaultSection from "@/components/VaultSection";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  askGideonContextLabel,
  canHaveLinkedClients,
  canHaveLinkedEmployees,
  canHaveLinkedFamilyMembers,
  canHaveLinkedHomes,
  canHaveLinkedPets,
  canHaveLinkedStudents,
  canHaveLinkedVehicles,
  vaultLabel,
} from "@/lib/profiles/types";

function DocumentsSection({
  userId,
  profileId,
  profileName,
}: {
  userId: string;
  profileId: string;
  profileName: string;
}) {
  const searchParams = useSearchParams();
  const autoOpenCamera = searchParams.get("camera") === "1";
  return (
    <DocumentManager
      userId={userId}
      profileId={profileId}
      profileName={profileName}
      autoOpenCamera={autoOpenCamera}
    />
  );
}

export default function DashboardVault({ userId }: { userId: string }) {
  const router = useRouter();
  const { active, profiles, loading } = useActiveProfile();

  useEffect(() => {
    const onChange = () => router.refresh();
    window.addEventListener("guardian:profile-changed", onChange);
    return () => window.removeEventListener("guardian:profile-changed", onChange);
  }, [router]);

  if (loading && !active && profiles.length === 0) {
    return (
      <p className="text-sm text-ink-muted">Loading…</p>
    );
  }
  if (!loading && profiles.length === 0) {
    return <ProfileSetupHub />;
  }
  if (!active) {
    return (
      <p className="text-sm text-ink-muted">
        No active person or space.{" "}
        <Link
          href="/settings/profiles"
          className="font-medium text-brand hover:text-brand-dark"
        >
          Manage people &amp; spaces
        </Link>{" "}
        to continue.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-14 z-30 -mx-4 flex items-center justify-between gap-3 border-b border-stone-200 bg-background/95 px-4 py-2.5 backdrop-blur sm:top-16 sm:mx-0 sm:rounded-xl sm:border sm:bg-white/95 sm:px-3 sm:shadow-sm">
        <p className="min-w-0 truncate text-sm text-ink-muted">
          {vaultLabel(active)}
        </p>
        <Link
          href="/ask"
          aria-label="Ask Gideon"
          title={askGideonContextLabel(active)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50 sm:px-3"
        >
          <MessageCircle className="h-3.5 w-3.5 text-brand" aria-hidden />
          Ask
          <span className="text-ink-muted" aria-hidden>
            →
          </span>
        </Link>
      </div>

      <VaultSection id={`attention-${active.id}`} title="Attention">
        <AlertsPanel profileId={active.id} />
      </VaultSection>

      {canHaveLinkedEmployees(active.profile_type) && (
        <VaultSection id={`employees-${active.id}`} title="Employees">
          <LinkedEmployeesPanel parent={active} />
        </VaultSection>
      )}

      {canHaveLinkedClients(active.profile_type) && (
        <VaultSection id={`clients-${active.id}`} title="Clients">
          <LinkedClientsPanel parent={active} />
        </VaultSection>
      )}

      {canHaveLinkedFamilyMembers(active.profile_type) && (
        <VaultSection id={`family-${active.id}`} title="Family members">
          <LinkedFamilyPanel parent={active} />
        </VaultSection>
      )}

      {canHaveLinkedStudents(active.profile_type) && (
        <VaultSection id={`students-${active.id}`} title="Students">
          <LinkedStudentsPanel parent={active} />
        </VaultSection>
      )}

      {canHaveLinkedPets(active.profile_type) && (
        <VaultSection id={`pets-${active.id}`} title="Pets">
          <LinkedPetsPanel parent={active} />
        </VaultSection>
      )}

      {canHaveLinkedHomes(active.profile_type) && (
        <VaultSection id={`homes-${active.id}`} title="Homes">
          <LinkedHomesPanel parent={active} />
        </VaultSection>
      )}

      {canHaveLinkedVehicles(active.profile_type) && (
        <VaultSection id={`vehicles-${active.id}`} title="Vehicles">
          <LinkedVehiclesPanel parent={active} />
        </VaultSection>
      )}

      <VaultSection id={`daily-log-${active.id}`} title="Daily Log">
        <DailyLogPanel
          profileId={active.id}
          profileName={active.display_name}
          profileType={active.profile_type}
        />
      </VaultSection>

      <VaultSection id={`documents-${active.id}`} title="Documents">
        <Suspense
          fallback={
            <DocumentManager
              userId={userId}
              profileId={active.id}
              profileName={active.display_name}
            />
          }
        >
          <DocumentsSection
            userId={userId}
            profileId={active.id}
            profileName={active.display_name}
          />
        </Suspense>
      </VaultSection>

      <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-5">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <p className="text-sm leading-relaxed text-ink-muted">
          Documents and Daily Logs belong only to the active profile. Switch
          profiles above or from the header to change context. Tap a section
          title to collapse or expand it.
        </p>
      </div>
    </div>
  );
}
