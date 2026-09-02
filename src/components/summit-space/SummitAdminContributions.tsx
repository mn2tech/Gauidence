"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ApprovedEntitySpec,
  CommunityExtractionResult,
  ContributionStatus,
  SummitCommunityContributionRow,
} from "@/lib/summit-space/contributions";

type Props = {
  summitSlug: string;
};

type AdminContribution = Omit<
  SummitCommunityContributionRow,
  "contributor_email" | "submission_ip_hash"
> & { fileUrl?: string | null };

type Counts = Record<ContributionStatus, number>;

export default function SummitAdminContributions({ summitSlug }: Props) {
  const [contributions, setContributions] = useState<AdminContribution[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/summit/${summitSlug}/contributions`);
    const json = await res.json();
    if (res.ok) {
      setContributions(json.contributions ?? []);
      setCounts(json.counts ?? null);
    }
    setLoading(false);
  }, [summitSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = contributions.find((c) => c.id === selectedId);

  async function moderate(
    action: "approve" | "reject" | "publish",
    extra?: { approvedEntities?: ApprovedEntitySpec[]; rejectionReason?: string }
  ) {
    if (!selectedId) return;
    setActionLoading(true);
    setMessage(null);
    const res = await fetch(`/api/summit/${summitSlug}/contributions`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contributionId: selectedId, action, ...extra }),
    });
    const json = await res.json();
    setActionLoading(false);
    if (res.ok) {
      setMessage(
        action === "publish"
          ? "Published to Summit Knowledge Hub."
          : action === "approve"
            ? "Approved — ready to publish."
            : "Rejected."
      );
      await load();
      if (action === "reject") setSelectedId(null);
    } else {
      setMessage(json.error ?? "Action failed");
    }
  }

  if (loading) {
    return <p className="mt-6 text-sm text-ink-muted">Loading contributions…</p>;
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Community Contributions</h2>
      {counts ? (
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-amber-100 px-3 py-1">
            Pending: {counts.pending}
          </span>
          <span className="rounded-full bg-blue-100 px-3 py-1">
            Approved: {counts.approved}
          </span>
          <span className="rounded-full bg-green-100 px-3 py-1">
            Published: {counts.published}
          </span>
          <span className="rounded-full bg-stone-100 px-3 py-1">
            Rejected: {counts.rejected}
          </span>
        </div>
      ) : null}

      {message ? (
        <p className="mt-3 text-sm font-medium text-brand">{message}</p>
      ) : null}

      <div className="mt-4 space-y-2">
        {contributions.length === 0 ? (
          <p className="text-sm text-ink-muted">No contributions yet.</p>
        ) : (
          contributions.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                selectedId === c.id
                  ? "border-brand bg-brand-light/20"
                  : "border-stone-200 bg-white hover:border-brand/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium capitalize">
                  {c.contribution_type} — {c.status}
                </span>
                <span className="text-xs text-ink-muted">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-ink-muted">{c.content}</p>
            </button>
          ))
        )}
      </div>

      {selected ? (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5">
          <h3 className="font-semibold">Review Contribution</h3>

          <div className="mt-3 space-y-3 text-sm">
            <div>
              <p className="font-medium">Original submission</p>
              <p className="mt-1 text-ink-muted">{selected.content}</p>
            </div>

            {selected.fileUrl ? (
              <div>
                <p className="font-medium">Uploaded file</p>
                <img
                  src={selected.fileUrl}
                  alt="Contribution upload"
                  className="mt-2 max-h-64 rounded-lg border border-stone-200 object-contain"
                />
              </div>
            ) : null}

            {(selected.contributor_name || selected.contributor_company) && (
              <div>
                <p className="font-medium">Contributor</p>
                <p className="text-ink-muted">
                  {[selected.contributor_name, selected.contributor_company]
                    .filter(Boolean)
                    .join(" · ")}
                  {selected.display_name_publicly
                    ? " (opted in to public display)"
                    : " (private)"}
                </p>
              </div>
            )}

            {selected.extracted_data &&
            Object.keys(selected.extracted_data).length > 0 ? (
              <div>
                <p className="font-medium">Extracted intelligence (proposed)</p>
                <ExtractionPreview
                  data={selected.extracted_data as CommunityExtractionResult}
                />
              </div>
            ) : null}

            {selected.source_url ? (
              <p className="text-xs text-ink-muted">
                Source: {selected.source_url}
              </p>
            ) : null}
          </div>

          {selected.status === "pending" || selected.status === "approved" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {selected.status === "pending" ? (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => moderate("approve")}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  Approve
                </button>
              ) : null}
              {(selected.status === "approved" || selected.status === "pending") && (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => moderate("publish")}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  Publish
                </button>
              )}
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => moderate("reject")}
                className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ExtractionPreview({ data }: { data: CommunityExtractionResult }) {
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-stone-50 p-3 text-xs">
      {data.sessionTitle ? <p>Session: {data.sessionTitle}</p> : null}
      {data.organizations?.length ? (
        <p>Organizations: {data.organizations.map((o) => o.name).join(", ")}</p>
      ) : null}
      {data.speakers?.length ? (
        <p>Speakers: {data.speakers.map((s) => s.name).join(", ")}</p>
      ) : null}
      {data.takeaways?.length ? (
        <p>Takeaways: {data.takeaways.join("; ")}</p>
      ) : null}
      {data.rawText ? (
        <p className="line-clamp-4 text-ink-muted">{data.rawText}</p>
      ) : null}
      {data.proposedEntities?.length ? (
        <p className="font-medium">
          {data.proposedEntities.length} proposed entity/relationship record(s)
        </p>
      ) : null}
    </div>
  );
}
