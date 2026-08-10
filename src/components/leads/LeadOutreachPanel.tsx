"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Mail } from "lucide-react";
import type { LeadOutreachDraft } from "@/lib/leads/outreach";
import type { BusinessLead } from "@/lib/leads/types";

const buttonSecondary =
  "inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-stone-50 disabled:opacity-50";

function readOutreachDraft(lead: BusinessLead): LeadOutreachDraft | null {
  const raw = lead.opportunity_brief;
  if (!raw || typeof raw !== "object") return null;
  const draft = (raw as Record<string, unknown>).outreachDraft;
  if (!draft || typeof draft !== "object") return null;
  const d = draft as Record<string, unknown>;
  const subject = String(d.subject ?? "").trim();
  const body = String(d.body ?? "").trim();
  if (!subject || !body) return null;
  return {
    subject,
    body,
    createdAt: String(d.createdAt ?? ""),
  };
}

type Props = {
  lead: BusinessLead;
  drafting: boolean;
  error: string | null;
  onDraft: () => void;
};

export default function LeadOutreachPanel({
  lead,
  drafting,
  error,
  onDraft,
}: Props) {
  const draft = readOutreachDraft(lead);
  const [copied, setCopied] = useState<"subject" | "body" | "all" | null>(null);

  async function copyText(text: string, which: "subject" | "body" | "all") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-brand" />
        <h2 className="font-semibold">Outreach</h2>
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        Gideon drafts a short personal email. Review and copy it — nothing is
        sent automatically in V1.
      </p>

      {draft ? (
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Subject</p>
              <button
                type="button"
                onClick={() => void copyText(draft.subject, "subject")}
                className="text-xs font-medium text-brand hover:underline"
              >
                {copied === "subject" ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-3 w-3" /> Copied
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Copy className="h-3 w-3" /> Copy
                  </span>
                )}
              </button>
            </div>
            <p className="mt-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              {draft.subject}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Email</p>
              <button
                type="button"
                onClick={() =>
                  void copyText(
                    `Subject: ${draft.subject}\n\n${draft.body}`,
                    "all"
                  )
                }
                className="text-xs font-medium text-brand hover:underline"
              >
                {copied === "all" ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-3 w-3" /> Copied
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Copy className="h-3 w-3" /> Copy all
                  </span>
                )}
              </button>
            </div>
            <pre className="mt-1 whitespace-pre-wrap rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-sm font-sans text-ink-muted">
              {draft.body}
            </pre>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <button
        type="button"
        disabled={drafting}
        onClick={onDraft}
        className={`mt-4 ${buttonSecondary}`}
      >
        {drafting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Mail className="h-4 w-4" />
        )}
        {draft ? "Regenerate draft" : "Draft Outreach"}
      </button>
    </div>
  );
}
