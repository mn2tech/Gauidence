"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Mail } from "lucide-react";
import type { LeadOutreachDraft } from "@/lib/leads/outreach";
import type { BusinessLead } from "@/lib/leads/types";

const buttonSecondary =
  "inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-stone-50 disabled:opacity-50";
const buttonPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50";
const inputClass =
  "w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";

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
  onApproved?: () => Promise<void> | void;
};

export default function LeadOutreachPanel({
  lead,
  drafting,
  error,
  onDraft,
  onApproved,
}: Props) {
  const saved = readOutreachDraft(lead);
  const [subject, setSubject] = useState(saved?.subject ?? "");
  const [body, setBody] = useState(saved?.body ?? "");
  const [approved, setApproved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!saved) return;
    setSubject(saved.subject);
    setBody(saved.body);
    setApproved(false);
  }, [saved?.createdAt, saved?.subject, saved?.body]);

  const draft = saved
    ? { ...saved, subject: subject || saved.subject, body: body || saved.body }
    : null;

  async function copyAll() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(
        `Subject: ${draft.subject}\n\n${draft.body}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function handleApprove() {
    setApproved(true);
    await onApproved?.();
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-brand" />
        <h2 className="font-semibold">Prepare Outreach</h2>
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        Prepare → Review → Edit → Approve → Send. Guardian does not send email
        in Phase 1. Copy the approved message into your inbox.
      </p>

      {draft ? (
        <div className="mt-4 space-y-4">
          {approved ? (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Approved. Copy and send from your email — nothing is sent from
              Guardian.
            </p>
          ) : (
            <p className="text-xs text-ink-muted">Review and edit before you copy.</p>
          )}
          <div>
            <label className="text-sm font-medium">Subject</label>
            <input
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setApproved(false);
              }}
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Message</label>
            <textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setApproved(false);
              }}
              rows={8}
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleApprove()}
              className={buttonPrimary}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={!approved}
              onClick={() => void copyAll()}
              className={buttonSecondary}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy to send
                </>
              )}
            </button>
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
        {draft ? "Regenerate draft" : "Prepare Outreach"}
      </button>
    </div>
  );
}
