"use client";

import type { PartnerFitResult } from "@/lib/leads/research/types";

export default function LeadPartnerFitCard({
  fit,
}: {
  fit?: PartnerFitResult | Record<string, unknown> | null;
}) {
  if (!fit || typeof fit !== "object") return null;
  const score = Number((fit as PartnerFitResult).score ?? 0);
  const priority = String((fit as PartnerFitResult).priority ?? "");
  const relationshipType = String((fit as PartnerFitResult).relationshipType ?? "");
  const why = String((fit as PartnerFitResult).whyCompanyMatters ?? "");
  const bring = Array.isArray((fit as PartnerFitResult).nm2techCanBring)
    ? (fit as PartnerFitResult).nm2techCanBring
    : String((fit as { nm2techCanBring?: unknown }).nm2techCanBring ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const angle = String((fit as PartnerFitResult).outreachAngle ?? "");
  if (!score && !why && !angle) return null;

  const tone =
    priority === "High"
      ? "border-emerald-200 bg-emerald-50"
      : priority === "Medium"
        ? "border-sky-200 bg-sky-50"
        : "border-stone-200 bg-stone-50";

  return (
    <div className={`rounded-2xl border p-5 ${tone}`}>
      <h2 className="font-semibold">NM2TECH Partner Fit</h2>
      <p className="mt-2 text-2xl font-bold">
        Partner Fit: {Number.isFinite(score) ? `${score}%` : "—"}
      </p>
      <p className="mt-1 text-sm">
        Priority: {priority || "—"}
        {relationshipType ? ` · Relationship Type: ${relationshipType}` : ""}
      </p>
      {why ? (
        <div className="mt-4">
          <p className="text-sm font-medium">Why this company matters</p>
          <p className="mt-1 text-sm text-ink-muted">{why}</p>
        </div>
      ) : null}
      {bring.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium">NM2TECH can bring</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {bring.map((item) => (
              <span
                key={item}
                className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {angle ? (
        <div className="mt-4">
          <p className="text-sm font-medium">Recommended Outreach Angle</p>
          <p className="mt-1 text-sm text-ink-muted">{angle}</p>
          <p className="mt-1 text-[11px] text-ink-muted">
            Internal guidance only — not sent to the company.
          </p>
        </div>
      ) : null}
    </div>
  );
}
