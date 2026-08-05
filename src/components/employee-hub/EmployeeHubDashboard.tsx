"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import type { GuardianProfile } from "@/lib/profiles/types";
import type { EmployeeHubEntitlements } from "@/lib/employee-hub/types";
import { useEmployeeHubEntitlements } from "@/hooks/useEmployeeHubEntitlements";
import EmployeeTimeCard from "@/components/employee-hub/EmployeeTimeCard";
import EmployeeLeavePanel from "@/components/employee-hub/EmployeeLeavePanel";
import EmployeeStatusPanel from "@/components/employee-hub/EmployeeStatusPanel";
import EmployeeInvoicePanel from "@/components/employee-hub/EmployeeInvoicePanel";

type Props = {
  employeeProfile: GuardianProfile;
  businessProfileId: string;
  userId: string;
};

export default function EmployeeHubDashboard({
  employeeProfile,
  businessProfileId,
  userId,
}: Props) {
  const { entitlements, loading } = useEmployeeHubEntitlements(
    employeeProfile.id,
    businessProfileId
  );

  if (loading && !entitlements) {
    return <p className="text-sm text-ink-muted">Loading employee hub…</p>;
  }

  const e = entitlements as EmployeeHubEntitlements;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {employeeProfile.display_name}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Employee hub — time, status, and requests
        </p>
      </div>

      {(e.time_tracking || e.manual_time_entry) && (
        <EmployeeTimeCard
          employeeProfileId={employeeProfile.id}
          businessProfileId={businessProfileId}
          entitlements={e}
        />
      )}

      {e.status_reports ? (
        <EmployeeStatusPanel profileId={employeeProfile.id} />
      ) : null}

      {e.leave_requests ? (
        <EmployeeLeavePanel employeeProfileId={employeeProfile.id} />
      ) : null}

      {e.invoice_upload ? (
        <EmployeeInvoicePanel
          profileId={employeeProfile.id}
          ownerUserId={employeeProfile.owner_user_id}
          userId={userId}
          showVaultLink={e.documents}
        />
      ) : null}

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-light text-brand">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Assigned client requests
            </h2>
            <p className="text-xs text-ink-muted">
              Tickets assigned to you from client vaults
            </p>
          </div>
        </div>
        <Link
          href="/requests"
          className="mt-3 inline-flex rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
        >
          View assigned requests
        </Link>
      </div>

      {e.gideon_chat ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-light text-brand">
              <MessageCircle className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-tight">Ask Gideon</h2>
              <p className="text-xs text-ink-muted">Questions about your work vault</p>
            </div>
          </div>
          <Link
            href="/ask"
            className="mt-3 inline-flex rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50"
          >
            Open Gideon
          </Link>
        </div>
      ) : null}
    </div>
  );
}
