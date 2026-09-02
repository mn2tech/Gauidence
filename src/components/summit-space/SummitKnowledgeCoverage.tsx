import type { PublishedSummitKnowledge } from "@/lib/summit-space/types";
import { buildSummitCoverageReport } from "@/lib/summit-space/graph";

type Props = {
  knowledge: PublishedSummitKnowledge;
};

export default function SummitKnowledgeCoverage({ knowledge }: Props) {
  const { counts, gaps } = buildSummitCoverageReport(knowledge);

  return (
    <section className="mt-8 rounded-2xl border border-stone-300 bg-stone-50 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
        Summit Knowledge Coverage
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        Private admin view — not visible to attendees.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {Object.entries(counts).map(([label, count]) => (
          <div key={label} className="flex justify-between rounded-lg bg-white px-3 py-2">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="font-semibold">{count}</dd>
          </div>
        ))}
      </dl>
      {gaps.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-900">Needs enrichment:</p>
          <ul className="mt-1 list-inside list-disc text-amber-800">
            {gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-sm text-green-700">
          All core categories have baseline coverage.
        </p>
      )}
    </section>
  );
}
