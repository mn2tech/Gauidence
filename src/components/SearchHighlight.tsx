import { Fragment, type ReactNode } from "react";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Highlight every case-insensitive occurrence while preserving original text. */
export default function SearchHighlight({
  text,
  term,
}: {
  text: string;
  term?: string | null;
}): ReactNode {
  const query = term?.trim();
  if (!query || !text) return text;

  const pattern = new RegExp(`(${escapeRegExp(query)})`, "gi");
  const pieces = text.split(pattern);

  return pieces.map((piece, index) =>
    piece.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={`${index}-${piece}`}
        className="rounded-sm bg-amber-200 px-0.5 text-inherit"
      >
        {piece}
      </mark>
    ) : (
      <Fragment key={`${index}-${piece}`}>{piece}</Fragment>
    )
  );
}
