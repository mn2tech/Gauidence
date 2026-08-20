"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import type { ExpertCatalogItem } from "@/lib/experts/expert-schema";
import type { UserExpert } from "@/lib/experts/expert-types";
import {
  isExpertInstallable,
  type ExpertStatus,
} from "@/lib/experts/expert-types";
import {
  STUDENT_GRADE_PACKAGES,
  type StudentGradePackage,
} from "@/lib/experts/student-packages";
import { expertStatusClass, expertStatusLabel } from "@/lib/experts/icons";

type CatalogExpert = ExpertCatalogItem & { effectiveStatus?: string };

type Props = {
  experts: CatalogExpert[];
  installations: UserExpert[];
  recommendedExpertId?: string | null;
  onInstall: (expert: CatalogExpert) => void;
};

function packageExpert(
  pkg: StudentGradePackage,
  experts: CatalogExpert[]
): CatalogExpert | undefined {
  if (!pkg.expertId) return undefined;
  return experts.find((expert) => expert.id === pkg.expertId);
}

export default function StudentGradePackages({
  experts,
  installations,
  recommendedExpertId,
  onInstall,
}: Props) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Student grade packages</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Pick the package for your grade. Grade 9 covers typical freshman material
          — Algebra I, English 9, Biology, world history and geography, plus study
          skills — so you can keep up and succeed. Later grades are on the way.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {STUDENT_GRADE_PACKAGES.map((pkg) => {
          const expert = packageExpert(pkg, experts);
          const status = expert
            ? ((expert.effectiveStatus ?? expert.status) as ExpertStatus)
            : "coming-soon";
          const installable = Boolean(expert && isExpertInstallable(status));
          const installation = expert
            ? installations.find((row) => row.expert_id === expert.id)
            : undefined;
          const recommended = Boolean(
            recommendedExpertId && pkg.expertId === recommendedExpertId
          );

          return (
            <article
              key={pkg.id}
              className={`rounded-2xl border bg-white p-5 ${
                recommended
                  ? "border-brand ring-1 ring-brand/20"
                  : "border-stone-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                    <GraduationCap className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                      {pkg.label}
                    </p>
                    <h3 className="mt-0.5 font-semibold">{pkg.title}</h3>
                    <p className="mt-1 text-sm text-ink-muted">{pkg.description}</p>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${expertStatusClass(status)}`}
                >
                  {pkg.status === "coming-soon"
                    ? "Coming soon"
                    : expertStatusLabel(status)}
                </span>
              </div>
              {recommended ? (
                <p className="mt-3 text-xs font-medium text-brand">
                  Suggested for this vault&apos;s grade
                </p>
              ) : null}
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {pkg.covers.map((item) => (
                  <li
                    key={item}
                    className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-xs text-ink-muted"
                  >
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-end">
                {pkg.status === "coming-soon" || !expert ? (
                  <button
                    type="button"
                    disabled
                    className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-ink-muted"
                  >
                    Coming soon
                  </button>
                ) : installation ? (
                  <Link
                    href={`/experts/${expert.id}?installation=${installation.id}`}
                    className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
                  >
                    Open package
                  </Link>
                ) : installable ? (
                  <button
                    type="button"
                    onClick={() => onInstall(expert)}
                    className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
                  >
                    Install package
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-ink-muted"
                  >
                    Unavailable
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
