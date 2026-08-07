"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, Search, ShieldCheck } from "lucide-react";
import DocumentManager from "@/components/DocumentManager";
import GlobalVaultSearch from "@/components/GlobalVaultSearch";
import { VaultHeaderProfileSwitch } from "@/components/ProfileSwitcher";
import AlertsPanel from "@/components/AlertsPanel";
import DailyLogPanel from "@/components/DailyLogPanel";
import LinkedEmployeesPanel from "@/components/LinkedEmployeesPanel";
import PayrollTimesheetPanel from "@/components/payroll/PayrollTimesheetPanel";
import OwnerLeavePanel from "@/components/employee-hub/OwnerLeavePanel";
import EmployeeClockPanel from "@/components/payroll/EmployeeClockPanel";
import LinkedClientsPanel from "@/components/LinkedClientsPanel";
import LinkedFamilyPanel from "@/components/LinkedFamilyPanel";
import LinkedVehiclesPanel from "@/components/LinkedVehiclesPanel";
import LinkedHomesPanel from "@/components/LinkedHomesPanel";
import LinkedPetsPanel from "@/components/LinkedPetsPanel";
import LinkedHobbiesPanel from "@/components/LinkedHobbiesPanel";
import LinkedStudentsPanel from "@/components/LinkedStudentsPanel";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import GettingStartedStrip from "@/components/GettingStartedStrip";
import AwardsPanel from "@/components/AwardsPanel";
import VaultSection from "@/components/VaultSection";
import VaultJumpBar from "@/components/VaultJumpBar";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  askGideonContextLabel,
  canHaveLinkedClients,
  canHaveLinkedEmployees,
  canHaveLinkedFamilyMembers,
  canHaveLinkedHobbies,
  canHaveLinkedHomes,
  canHaveLinkedPets,
  canHaveLinkedStudents,
  canHaveLinkedVehicles,
  isClientViewerProfile,
  type GuardianProfileType,
} from "@/lib/profiles/types";
import { EMPLOYEE_HUB_PATH } from "@/lib/employee-hub/routing";
import { hasDocumentsIntent, REQUESTS_PATH } from "@/lib/routes";
import { clientBusinessLabel } from "@/lib/client-requests/helpers";

function vaultSwitchHref(profileId: string, searchParams: URLSearchParams) {
  const params = new URLSearchParams(searchParams.toString());
  if (!params.has("docs")) params.set("docs", "1");
  const qs = params.toString();
  return `/dashboard?${qs}#documents-${profileId}`;
}

function VaultStickyBar({
  onVaultSwitch,
  onSearchOpen,
  actions,
}: {
  onVaultSwitch: (id: string) => void;
  onSearchOpen: () => void;
  actions: ReactNode;
}) {
  return (
    <div className="sticky top-14 z-30 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-background/95 px-4 py-2.5 backdrop-blur sm:top-16 sm:mx-0 sm:rounded-xl sm:border sm:bg-white/95 sm:px-3 sm:shadow-sm">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <VaultHeaderProfileSwitch onAfterSwitch={onVaultSwitch} />
        <button
          type="button"
          onClick={onSearchOpen}
          aria-label="Search vaults and content"
          title="Search vaults, logs, and documents across every vault"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50 sm:px-3"
        >
          <Search className="h-3.5 w-3.5 text-brand" aria-hidden />
          Search
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    </div>
  );
}

function DocumentsSection({
  userId,
  profileId,
  profileName,
  ownerUserId,
}: {
  userId: string;
  profileId: string;
  profileName: string;
  ownerUserId: string;
}) {
  const searchParams = useSearchParams();
  const autoOpenCamera = searchParams.get("camera") === "1";
  const highlightDocumentId = searchParams.get("documentId");
  const searchTerm = searchParams.get("searchTerm");
  return (
    <DocumentManager
      userId={userId}
      profileId={profileId}
      profileName={profileName}
      ownerUserId={ownerUserId}
      autoOpenCamera={autoOpenCamera}
      highlightDocumentId={highlightDocumentId}
      searchTerm={searchTerm}
    />
  );
}

function DailyLogSection({
  profileId,
  profileName,
  profileType,
}: {
  profileId: string;
  profileName: string;
  profileType: GuardianProfileType;
}) {
  const searchParams = useSearchParams();
  const highlightLogId = searchParams.get("logId");
  const searchTerm = searchParams.get("searchTerm");
  return (
    <DailyLogPanel
      profileId={profileId}
      profileName={profileName}
      profileType={profileType}
      highlightLogId={highlightLogId}
      searchTerm={searchTerm}
    />
  );
}

function useVaultSectionDefaults(profileId: string) {
  const searchParams = useSearchParams();

  return useMemo(() => {
    const hash =
      typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    const hasLogIntent = searchParams.has("logId");
    const hasDocIntent =
      searchParams.get("camera") === "1" ||
      searchParams.has("documentId") ||
      searchParams.has("searchTerm");

    const matches = (sectionId: string) => hash === sectionId;

    const sectionOpen = (sectionId: string, fallback = false) => {
      if (matches(sectionId)) return true;
      if (hash) return false;
      if (sectionId === `documents-${profileId}`) {
        return hasDocIntent || !hasLogIntent;
      }
      if (sectionId === `daily-log-${profileId}`) {
        return hasLogIntent;
      }
      return fallback;
    };

    return {
      files: sectionOpen(`documents-${profileId}`),
      dailyLog: sectionOpen(`daily-log-${profileId}`),
      attention: matches(`attention-${profileId}`),
      employees: matches(`employees-${profileId}`),
      leave: matches(`leave-${profileId}`),
      timesheets: matches(`timesheets-${profileId}`),
      myHours: matches(`my-hours-${profileId}`),
      clients: matches(`clients-${profileId}`),
      family: matches(`family-${profileId}`),
      students: matches(`students-${profileId}`),
      pets: matches(`pets-${profileId}`),
      hobbies: matches(`hobbies-${profileId}`),
      homes: matches(`homes-${profileId}`),
      vehicles: matches(`vehicles-${profileId}`),
    };
  }, [profileId, searchParams]);
}

export default function DashboardVault({ userId }: { userId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { active, profiles, loading, switchProfile } = useActiveProfile();
  const requestedProfileId = searchParams.get("profileId");
  const switchingRef = useRef(false);
  const sectionDefaults = useVaultSectionDefaults(active?.id ?? "");
  const [vaultSearchOpen, setVaultSearchOpen] = useState(false);

  const handleVaultSwitch = useCallback(
    (profileId: string) => {
      router.replace(vaultSwitchHref(profileId, searchParams));
    },
    [router, searchParams]
  );

  useEffect(() => {
    const onChange = () => router.refresh();
    window.addEventListener("guardian:profile-changed", onChange);
    return () => window.removeEventListener("guardian:profile-changed", onChange);
  }, [router]);

  useEffect(() => {
    if (!requestedProfileId || loading || switchingRef.current) return;
    if (active?.id === requestedProfileId) return;
    if (!profiles.some((p) => p.id === requestedProfileId)) return;
    switchingRef.current = true;
    void switchProfile(requestedProfileId).finally(() => {
      switchingRef.current = false;
    });
  }, [requestedProfileId, active?.id, loading, profiles, switchProfile]);

  useEffect(() => {
    if (!active || loading) return;
    if (active.profile_type !== "employee" || !active.parent_profile_id) return;
    const params: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
    if (hasDocumentsIntent(params)) return;
    if (
      typeof window !== "undefined" &&
      window.location.hash.startsWith("#documents-")
    ) {
      return;
    }
    router.replace(EMPLOYEE_HUB_PATH);
  }, [active, loading, router, searchParams]);

  if (loading && !active && profiles.length === 0) {
    return (
      <p className="text-sm text-ink-muted">Loading…</p>
    );
  }
  if (!loading && profiles.length === 0) {
    return <ProfileSetupHub returnTo="/ask" />;
  }
  if (!active) {
    return (
      <p className="text-sm text-ink-muted">
        No active person or space.{" "}
        <Link
          href="/settings/profiles"
          className="font-medium text-brand hover:text-brand-dark"
        >
          Manage vaults
        </Link>{" "}
        to continue.
      </p>
    );
  }

  if (isClientViewerProfile(active)) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-base font-semibold text-foreground">
            Shared with you
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Documents shared for{" "}
            <span className="font-medium text-foreground">
              {active.display_name}
            </span>
            . Use Requests to message your provider or ask for more files.
          </p>
          <Link
            href={REQUESTS_PATH}
            className="mt-3 inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:border-stone-400 hover:bg-stone-50"
          >
            My requests
          </Link>
        </div>

        <VaultStickyBar
          onVaultSwitch={handleVaultSwitch}
          onSearchOpen={() => setVaultSearchOpen(true)}
          actions={
            <>
              <Link
                href={REQUESTS_PATH}
                aria-label="My requests"
                title="View and create requests"
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50 sm:px-3"
              >
                Requests
              </Link>
              <Link
                href="/ask"
                aria-label="Ask Gideon"
                title={askGideonContextLabel(active)}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50 sm:px-3"
              >
                <MessageCircle className="h-3.5 w-3.5 text-brand" aria-hidden />
                Ask
                <span className="text-ink-muted" aria-hidden>
                  →
                </span>
              </Link>
            </>
          }
        />

        <VaultSection
          id={`documents-${active.id}`}
          title="Shared documents"
          defaultOpen
        >
          <Suspense
            fallback={
              <DocumentManager
                userId={userId}
                profileId={active.id}
                profileName={active.display_name}
                ownerUserId={active.owner_user_id}
              />
            }
          >
            <DocumentsSection
              userId={userId}
              profileId={active.id}
              profileName={active.display_name}
              ownerUserId={active.owner_user_id}
            />
          </Suspense>
        </VaultSection>
        <GlobalVaultSearch
          open={vaultSearchOpen}
          onClose={() => setVaultSearchOpen(false)}
          defaultScope="global"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GettingStartedStrip />

      <VaultStickyBar
        onVaultSwitch={handleVaultSwitch}
        onSearchOpen={() => setVaultSearchOpen(true)}
        actions={
          <>
            {active.profile_type === "client" ? (
              <>
                <Link
                  href={REQUESTS_PATH}
                  aria-label="My requests"
                  title="View your requests"
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50 sm:px-3"
                >
                  Requests
                </Link>
                <Link
                  href={`${REQUESTS_PATH}?new=1`}
                  aria-label="New request"
                  title={`New request for ${clientBusinessLabel(profiles, active)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/10 sm:px-3"
                >
                  New request
                </Link>
              </>
            ) : (
              <Link
                href="/research"
                aria-label="Research"
                title="Research a company or person"
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50 sm:px-3"
              >
                Research
              </Link>
            )}
            <Link
              href="/ask"
              aria-label="Ask Gideon"
              title={askGideonContextLabel(active)}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50 sm:px-3"
            >
              <MessageCircle className="h-3.5 w-3.5 text-brand" aria-hidden />
              Ask
              <span className="text-ink-muted" aria-hidden>
                →
              </span>
            </Link>
          </>
        }
      />

      <VaultJumpBar profile={active} />

      <VaultSection
        id={`documents-${active.id}`}
        title="Files"
        defaultOpen={sectionDefaults.files}
      >
        <Suspense
          fallback={
            <DocumentManager
              userId={userId}
              profileId={active.id}
              profileName={active.display_name}
              ownerUserId={active.owner_user_id}
            />
          }
        >
          <DocumentsSection
            userId={userId}
            profileId={active.id}
            profileName={active.display_name}
            ownerUserId={active.owner_user_id}
          />
        </Suspense>
      </VaultSection>

      <VaultSection
        id={`daily-log-${active.id}`}
        title="Daily Log"
        defaultOpen={sectionDefaults.dailyLog}
      >
        <Suspense
          fallback={
            <DailyLogPanel
              profileId={active.id}
              profileName={active.display_name}
              profileType={active.profile_type}
            />
          }
        >
          <DailyLogSection
            profileId={active.id}
            profileName={active.display_name}
            profileType={active.profile_type}
          />
        </Suspense>
      </VaultSection>

      <VaultSection
        id={`attention-${active.id}`}
        title="Attention"
        defaultOpen={sectionDefaults.attention}
      >
        <AlertsPanel profileId={active.id} />
      </VaultSection>

      {canHaveLinkedEmployees(active.profile_type) && (
        <VaultSection
          id={`leave-${active.id}`}
          title="Leave requests"
          defaultOpen={sectionDefaults.leave}
        >
          <OwnerLeavePanel businessProfileId={active.id} />
        </VaultSection>
      )}

      {canHaveLinkedEmployees(active.profile_type) && (
        <VaultSection
          id={`timesheets-${active.id}`}
          title="Timesheets"
          defaultOpen={sectionDefaults.timesheets}
        >
          <PayrollTimesheetPanel businessProfile={active} />
        </VaultSection>
      )}

      {active.profile_type === "employee" && active.parent_profile_id ? (
        <VaultSection
          id={`my-hours-${active.id}`}
          title="My hours"
          defaultOpen={sectionDefaults.myHours}
        >
          <EmployeeClockPanel
            employeeProfile={active}
            businessProfileId={active.parent_profile_id}
          />
        </VaultSection>
      ) : null}

      {canHaveLinkedEmployees(active.profile_type) && (
        <VaultSection
          id={`employees-${active.id}`}
          title="Employees"
          defaultOpen={sectionDefaults.employees}
        >
          <LinkedEmployeesPanel parent={active} />
        </VaultSection>
      )}

      {canHaveLinkedClients(active.profile_type) && (
        <VaultSection
          id={`clients-${active.id}`}
          title="Clients"
          defaultOpen={sectionDefaults.clients}
        >
          <LinkedClientsPanel parent={active} />
        </VaultSection>
      )}

      {canHaveLinkedFamilyMembers(active.profile_type) && (
        <VaultSection
          id={`family-${active.id}`}
          title="Family members"
          defaultOpen={sectionDefaults.family}
        >
          <LinkedFamilyPanel parent={active} />
        </VaultSection>
      )}

      {canHaveLinkedStudents(active.profile_type) && (
        <VaultSection
          id={`students-${active.id}`}
          title="Students"
          defaultOpen={sectionDefaults.students}
        >
          <LinkedStudentsPanel parent={active} />
        </VaultSection>
      )}

      {canHaveLinkedPets(active.profile_type) && (
        <VaultSection
          id={`pets-${active.id}`}
          title="Pets"
          defaultOpen={sectionDefaults.pets}
        >
          <LinkedPetsPanel parent={active} />
        </VaultSection>
      )}

      {canHaveLinkedHobbies(active.profile_type) && (
        <VaultSection
          id={`hobbies-${active.id}`}
          title="Hobbies & sports"
          defaultOpen={sectionDefaults.hobbies}
        >
          <LinkedHobbiesPanel parent={active} />
        </VaultSection>
      )}

      {canHaveLinkedHomes(active.profile_type) && (
        <VaultSection
          id={`homes-${active.id}`}
          title="Homes"
          defaultOpen={sectionDefaults.homes}
        >
          <LinkedHomesPanel parent={active} />
        </VaultSection>
      )}

      {canHaveLinkedVehicles(active.profile_type) && (
        <VaultSection
          id={`vehicles-${active.id}`}
          title="Vehicles"
          defaultOpen={sectionDefaults.vehicles}
        >
          <LinkedVehiclesPanel parent={active} />
        </VaultSection>
      )}

      <AwardsPanel compact />

      <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-5">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <p className="text-sm leading-relaxed text-ink-muted">
          Files and Daily Logs belong to the active profile. Use the section
          chips above to jump quickly, or tap a title to expand or collapse.
        </p>
      </div>
      <GlobalVaultSearch
        open={vaultSearchOpen}
        onClose={() => setVaultSearchOpen(false)}
        defaultScope="global"
      />
    </div>
  );
}
