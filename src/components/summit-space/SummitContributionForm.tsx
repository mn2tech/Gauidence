"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import type { SummitEntityRow } from "@/lib/summit-space/types";
import {
  CONTRIBUTION_TYPE_ICONS,
  CONTRIBUTION_TYPE_LABELS,
  CONTRIBUTION_TYPES,
  type ContributionType,
} from "@/lib/summit-space/contributions";

type Props = {
  summitSlug: string;
  entities: SummitEntityRow[];
  onClose?: () => void;
  initialType?: ContributionType;
};

type Step = "type" | "form" | "success";

export default function SummitContributionForm({
  summitSlug,
  entities,
  onClose,
  initialType,
}: Props) {
  const [step, setStep] = useState<Step>(initialType ? "form" : "type");
  const [contributionType, setContributionType] = useState<ContributionType | null>(
    initialType ?? null
  );
  const [content, setContent] = useState("");
  const [sessionEntityId, setSessionEntityId] = useState("");
  const [organizationEntityId, setOrganizationEntityId] = useState("");
  const [speakerEntityId, setSpeakerEntityId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [contributorName, setContributorName] = useState("");
  const [contributorCompany, setContributorCompany] = useState("");
  const [contributorEmail, setContributorEmail] = useState("");
  const [displayNamePublicly, setDisplayNamePublicly] = useState(false);
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const sessions = entities.filter((e) => e.entity_type === "session");
  const organizations = entities.filter((e) => e.entity_type === "organization");
  const speakers = entities.filter((e) => e.entity_type === "person");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!contributionType || !permissionConfirmed) return;
    setStatus("loading");
    setError(null);

    const form = new FormData();
    form.append("contributionType", contributionType);
    form.append("content", content);
    form.append("permissionConfirmed", "true");
    form.append("displayNamePublicly", displayNamePublicly ? "true" : "false");
    if (sessionEntityId) form.append("sessionEntityId", sessionEntityId);
    if (organizationEntityId) form.append("organizationEntityId", organizationEntityId);
    if (speakerEntityId) form.append("speakerEntityId", speakerEntityId);
    if (sourceUrl) form.append("sourceUrl", sourceUrl);
    if (contributorName) form.append("contributorName", contributorName);
    if (contributorCompany) form.append("contributorCompany", contributorCompany);
    if (contributorEmail) form.append("contributorEmail", contributorEmail);
    if (selectedFile) form.append("file", selectedFile);

    const res = await fetch(`/api/public/summit/${summitSlug}/contributions`, {
      method: "POST",
      body: form,
    });

    if (res.ok) {
      setStep("success");
      setStatus("idle");
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Could not submit — please try again.");
      setStatus("error");
    }
  }

  if (step === "success") {
    return (
      <div className="rounded-2xl border border-brand/30 bg-brand-light/20 p-6 text-center">
        <p className="text-lg font-semibold">Thanks for contributing!</p>
        <p className="mt-2 text-sm text-ink-muted">
          Your insight has been submitted for review. Once approved, Guardian can
          connect it with the Summit Knowledge Hub so other attendees can discover
          it through search and Gideon.
        </p>
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm font-medium">
            Want Guardian to organize knowledge for your organization?
          </p>
          <Link
            href="/"
            className="mt-3 inline-block text-sm font-semibold text-brand hover:underline"
          >
            Learn About Guardian
          </Link>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 text-sm text-ink-muted hover:underline"
          >
            Close
          </button>
        ) : null}
      </div>
    );
  }

  if (step === "type") {
    return (
      <div>
        <h2 className="text-lg font-semibold">Share What You Learned</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Choose what you&apos;d like to share with the summit community.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {CONTRIBUTION_TYPES.filter((t) => t !== "note").map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setContributionType(type);
                setStep("form");
              }}
              className="flex flex-col items-center rounded-2xl border border-stone-200 bg-white p-4 text-center transition hover:border-brand/40"
            >
              <span className="text-2xl">{CONTRIBUTION_TYPE_ICONS[type]}</span>
              <span className="mt-2 text-sm font-semibold">
                {CONTRIBUTION_TYPE_LABELS[type]}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setContributionType("note");
            setStep("form");
          }}
          className="mt-3 w-full rounded-xl border border-dashed border-stone-300 py-3 text-sm font-medium text-ink-muted hover:border-brand/40"
        >
          General Note
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full text-sm text-ink-muted hover:underline"
          >
            Cancel
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setStep("type")}
          className="text-sm text-brand hover:underline"
        >
          ← Back
        </button>
        <h2 className="text-lg font-semibold">
          {contributionType ? CONTRIBUTION_TYPE_LABELS[contributionType] : "Share"}
        </h2>
      </div>

      <div className="mt-4 space-y-3">
        {(contributionType === "photo" || contributionType === "resource") && (
          <div>
            <label className="block text-sm font-medium">
              {contributionType === "photo" ? "Photo" : "File"} (optional)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              capture={contributionType === "photo" ? "environment" : undefined}
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm"
            />
            {contributionType === "photo" && !selectedFile ? (
              <p className="mt-1 text-xs text-rose-600">Photo required for photo contributions</p>
            ) : null}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium">
            What did you learn? <span className="text-rose-600">*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={4}
            placeholder="Share your takeaway, opportunity, or resource..."
            className="mt-1 w-full rounded-xl border border-stone-200 p-3 text-base"
          />
        </div>

        {sessions.length > 0 && (
          <div>
            <label className="block text-sm font-medium">Session (optional)</label>
            <select
              value={sessionEntityId}
              onChange={(e) => setSessionEntityId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 p-3 text-base"
            >
              <option value="">— Select session —</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {organizations.length > 0 && (
          <div>
            <label className="block text-sm font-medium">Organization (optional)</label>
            <select
              value={organizationEntityId}
              onChange={(e) => setOrganizationEntityId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 p-3 text-base"
            >
              <option value="">— Select organization —</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {speakers.length > 0 && (
          <div>
            <label className="block text-sm font-medium">Speaker (optional)</label>
            <select
              value={speakerEntityId}
              onChange={(e) => setSpeakerEntityId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 p-3 text-base"
            >
              <option value="">— Select speaker —</option>
              {speakers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium">Source URL (optional)</label>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://"
            className="mt-1 w-full rounded-xl border border-stone-200 p-3 text-base"
          />
        </div>

        <details className="rounded-xl border border-stone-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Your info (optional)
          </summary>
          <div className="mt-3 space-y-3">
            <input
              value={contributorName}
              onChange={(e) => setContributorName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-xl border border-stone-200 p-3 text-base"
            />
            <input
              value={contributorCompany}
              onChange={(e) => setContributorCompany(e.target.value)}
              placeholder="Company"
              className="w-full rounded-xl border border-stone-200 p-3 text-base"
            />
            <input
              type="email"
              value={contributorEmail}
              onChange={(e) => setContributorEmail(e.target.value)}
              placeholder="Email (private — never displayed)"
              className="w-full rounded-xl border border-stone-200 p-3 text-base"
            />
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={displayNamePublicly}
                onChange={(e) => setDisplayNamePublicly(e.target.checked)}
                className="mt-1"
              />
              <span>Display my name/company with this contribution</span>
            </label>
          </div>
        </details>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={permissionConfirmed}
            onChange={(e) => setPermissionConfirmed(e.target.checked)}
            required
            className="mt-1"
          />
          <span>
            I confirm that I have permission to share this information and that it
            does not contain confidential or proprietary information.
          </span>
        </label>
      </div>

      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

      <button
        type="submit"
        disabled={
          status === "loading" ||
          !permissionConfirmed ||
          !content.trim() ||
          (contributionType === "photo" && !selectedFile)
        }
        className="mt-4 w-full rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {status === "loading" ? "Submitting…" : "Share Insight"}
      </button>
    </form>
  );
}
