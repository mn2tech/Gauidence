"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Loader2,
  MessageCircle,
  Package,
  Users,
} from "lucide-react";
import type { WorldEntityDetail } from "@/lib/world/apiTypes";
import {
  ASK_GIDEON_PATH,
  WORLD_PATH,
  askAboutWorldEntityHref,
  worldEntityHref,
} from "@/lib/routes";

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="simple-home-card p-4 sm:p-5">
      <h2 className="text-lg font-bold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function WorldEntityScreen({ entityId }: { entityId: string }) {
  const [detail, setDetail] = useState<WorldEntityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/world/entities/${encodeURIComponent(entityId)}`);
      const body = (await res.json().catch(() => ({}))) as WorldEntityDetail & {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't find this.");
        setDetail(null);
        return;
      }
      setDetail(body);
    } catch {
      setError("Couldn't reach Guardian.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </p>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link
          href={WORLD_PATH}
          className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> My World
        </Link>
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error ?? "Not found."}
        </p>
      </div>
    );
  }

  const askHref = askAboutWorldEntityHref({
    entityId: detail.entity.id,
    entityName: detail.entity.name,
    spaceId: detail.primarySpaceId,
  });

  const Icon =
    detail.entity.group === "people"
      ? Users
      : detail.entity.group === "organizations"
        ? Building2
        : Package;

  return (
    <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:py-8">
      <div>
        <Link
          href={WORLD_PATH}
          className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> My World
        </Link>
      </div>

      <header className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-600">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {detail.entity.typeLabel}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {detail.entity.name}
          </h1>
          {detail.relationshipToUser ? (
            <p className="mt-1 text-sm text-ink-muted">
              Connection: {detail.relationshipToUser}
            </p>
          ) : null}
          {detail.description ? (
            <p className="mt-2 text-sm text-foreground/90">{detail.description}</p>
          ) : null}
          {detail.aliases.length > 0 ? (
            <p className="mt-2 text-xs text-ink-muted">
              Also known as: {detail.aliases.join(", ")}
            </p>
          ) : null}
        </div>
      </header>

      <Link
        href={askHref}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        Ask Gideon about {detail.entity.name}
      </Link>

      {detail.attention.length > 0 ? (
        <Section title="Needs attention">
          <ul className="space-y-2">
            {detail.attention.map((item) => (
              <li
                key={item.id}
                className="flex gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <p className="font-semibold">{item.title}</p>
                  {item.description ? (
                    <p className="text-sm text-ink-muted">{item.description}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {detail.relatedPeople.length > 0 ? (
        <Section title="Related people">
          <ul className="divide-y divide-stone-100">
            {detail.relatedPeople.map((p) => (
              <li key={p.id}>
                <Link
                  href={worldEntityHref(p.id)}
                  className="flex items-center justify-between py-2.5 hover:text-brand"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-ink-muted">{p.typeLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {detail.relatedOrganizations.length > 0 ? (
        <Section title="Related organizations">
          <ul className="divide-y divide-stone-100">
            {detail.relatedOrganizations.map((o) => (
              <li key={o.id}>
                <Link
                  href={worldEntityHref(o.id)}
                  className="flex items-center justify-between py-2.5 hover:text-brand"
                >
                  <span className="font-medium">{o.name}</span>
                  <span className="text-xs text-ink-muted">{o.typeLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {detail.relationships.length > 0 ? (
        <Section title="Connections">
          <ul className="space-y-2 text-sm">
            {detail.relationships.map((r) => (
              <li key={r.id} className="text-ink-muted">
                <span className="font-medium text-foreground">
                  {r.typeLabel}
                </span>
                {" → "}
                <Link
                  href={worldEntityHref(r.other.id)}
                  className="font-semibold text-brand hover:underline"
                >
                  {r.other.name}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {detail.timeline.length > 0 ? (
        <Section title="Timeline">
          <ul className="space-y-3">
            {detail.timeline.map((t) => (
              <li key={t.id} className="border-l-2 border-stone-200 pl-3">
                <p className="font-medium text-foreground">{t.title}</p>
                {t.summary ? (
                  <p className="mt-0.5 text-sm text-ink-muted">{t.summary}</p>
                ) : null}
                <p className="mt-1 text-xs text-ink-muted">
                  {formatWhen(t.occurredAt)}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {detail.facts.length > 0 ? (
        <Section title="What Guardian knows">
          <ul className="space-y-2 text-sm">
            {detail.facts.map((f) => (
              <li key={f.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium capitalize text-ink-muted">
                  {f.predicate.replace(/_/g, " ")}:
                </span>
                <span className="text-foreground">
                  {f.valueText ??
                    (f.valueNumber != null ? String(f.valueNumber) : null) ??
                    (f.valueDate ? formatWhen(f.valueDate) : "—")}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {detail.evidence.length > 0 ? (
        <Section title="Why Guardian believes this">
          <ul className="space-y-3">
            {detail.evidence.map((e) => (
              <li
                key={e.id}
                className="rounded-xl bg-stone-50 px-3 py-2.5 text-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {e.sourceTitle ?? e.sourceType}
                </p>
                {e.sourceExcerpt ? (
                  <p className="mt-1 text-foreground/90">&ldquo;{e.sourceExcerpt}&rdquo;</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="flex flex-wrap gap-2 pb-6">
        <Link
          href={askHref}
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Ask Gideon
        </Link>
        <Link
          href={ASK_GIDEON_PATH}
          className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold hover:bg-stone-50"
        >
          Open Ask
        </Link>
      </div>
    </div>
  );
}
