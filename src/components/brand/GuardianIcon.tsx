import Image from "next/image";
import {
  GUARDIAN_ICON_SRC,
  guardianBrandToneClass,
  type GuardianBrandTone,
} from "@/lib/branding";

type Props = {
  size?: number;
  tone?: GuardianBrandTone;
  pulse?: boolean;
  className?: string;
  priority?: boolean;
  alt?: string;
};

/** Star mark only — favicon-scale UI, collapsed nav, loading. */
export default function GuardianIcon({
  size = 28,
  tone = "light",
  pulse = false,
  className = "",
  priority = false,
  alt = "Guardian",
}: Props) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${
        pulse ? "animate-pulse" : ""
      } ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={GUARDIAN_ICON_SRC}
        alt={alt}
        width={size}
        height={size}
        priority={priority}
        className={`object-contain ${guardianBrandToneClass(tone)}`}
        style={{ width: size, height: size }}
      />
    </span>
  );
}
