"use client";

import { useState } from "react";
import type { ExpertCatalogItem } from "@/lib/experts/expert-schema";
import AdminExpertAssignForm from "@/components/admin/AdminExpertAssignForm";
import AdminExpertEntitlementsPanel from "@/components/admin/AdminExpertEntitlementsPanel";

type Props = {
  experts: ExpertCatalogItem[];
};

export default function AdminExpertsSettings({ experts }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-10">
      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Grant or assign</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Add access for a user by email. They must already have a Guardian account.
        </p>
        <div className="mt-5">
          <AdminExpertAssignForm
            experts={experts}
            onSuccess={() => setRefreshKey((key) => key + 1)}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-6">
        <AdminExpertEntitlementsPanel experts={experts} refreshKey={refreshKey} />
      </div>
    </div>
  );
}
