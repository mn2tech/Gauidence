"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import GuardianIcon from "@/components/brand/GuardianIcon";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import RecruitReportView from "@/components/recruit/RecruitReportView";
import type { ReportData } from "@/lib/recruit/types";

type Props = { token: string };

export default function SharedRecruitReportClient({ token }: Props) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/recruit/report/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          report?: ReportData;
        };
        if (cancelled) return;
        if (!res.ok || !body.report) {
          setError(body.error ?? "Couldn't load this report.");
          return;
        }
        setReport(body.report);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this report.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-12">
          <div className="mb-8 flex items-center gap-2 text-sm text-ink-muted">
            <GuardianIcon size={16} surface="black" alt="" />
            <span>Shared securely via Guardian Recruit</span>
            <span className="text-stone-300">·</span>
            <Link href="/" className="text-brand hover:text-brand-dark">
              Learn more
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading report…
            </div>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {report ? <RecruitReportView report={report} readOnly /> : null}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
