import { formatSourceAttribution } from "@/lib/summit-space/sourceTypes";

type Props = {
  sourceType: string;
  className?: string;
};

export default function SummitSourceBadge({ sourceType, className = "" }: Props) {
  const label = formatSourceAttribution(sourceType);
  const colorClass =
    sourceType === "guardian_insight"
      ? "text-amber-700"
      : sourceType === "public"
        ? "text-blue-700"
        : "text-brand";

  return (
    <p className={`text-xs font-medium ${colorClass} ${className}`}>{label}</p>
  );
}
