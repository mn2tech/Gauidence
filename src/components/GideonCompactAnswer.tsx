"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { renderGideonText } from "@/components/gideonText";
import { splitCompactAnswer } from "@/lib/vault/compactAnswer";

type Props = {
  content: string;
  /** While streaming, always show the full growing answer. */
  forceFull?: boolean;
};

/**
 * Long Gideon sections collapse to a short lead + ~3 bullets,
 * with "Show full answer" so action buttons stay above the fold.
 */
export default function GideonCompactAnswer({ content, forceFull = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const split = useMemo(() => splitCompactAnswer(content), [content]);

  const showFull = forceFull || !split.shouldCollapse || expanded;
  const text = showFull ? content : split.preview;

  return (
    <div>
      <p className="whitespace-pre-wrap text-foreground/90">
        {renderGideonText(text)}
      </p>
      {split.shouldCollapse && !forceFull ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:text-brand-dark"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              Show full answer
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}
