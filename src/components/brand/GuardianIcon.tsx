import Image from "next/image";
import {
  GUARDIAN_ICON_SRC,
  guardianBrandToneClass,
  type GuardianBrandTone,
} from "@/lib/branding";

type Props = {
  size?: number;
  tone?: GuardianBrandTone;
  /** Black tile with a white star. */
  surface?: "plain" | "black";
  pulse?: boolean;
  className?: string;
  priority?: boolean;
  alt?: string;
};

/** Star mark only — favicon-scale UI, collapsed nav, loading. */
export default function GuardianIcon({
  size = 28,
  tone = "light",
  surface = "plain",
  pulse = false,
  className = "",
  priority = false,
  alt = "Guardian",
}: Props) {
  const onBlack = surface === "black";
  const markTone: GuardianBrandTone = onBlack ? "dark" : tone;
  const pad = onBlack ? Math.max(4, Math.round(size * 0.18)) : 0;
  const outer = size + pad * 2;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${
        onBlack ? "rounded-md bg-black" : ""
      } ${pulse ? "animate-pulse" : ""} ${className}`}
      style={{ width: outer, height: outer, padding: pad }}
    >
      <Image
        src={GUARDIAN_ICON_SRC}
        alt={alt}
        width={size}
        height={size}
        priority={priority}
        className={`object-contain ${guardianBrandToneClass(markTone)}`}
        style={{ width: size, height: size }}
      />
    </span>
  );
}
