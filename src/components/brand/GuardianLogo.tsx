import Image from "next/image";
import {
  GUARDIAN_BRAND_TAGLINE,
  GUARDIAN_LOGO_SRC,
  GUARDIAN_WORDMARK_SRC,
  guardianBrandToneClass,
  type GuardianBrandTone,
} from "@/lib/branding";
import GuardianIcon from "@/components/brand/GuardianIcon";

export type GuardianLogoSize = "sm" | "md" | "lg" | "xl";

type Props = {
  /** `horizontal` for headers; `lockup` for login, landing, and empty states. */
  variant?: "horizontal" | "lockup";
  size?: GuardianLogoSize;
  tone?: GuardianBrandTone;
  /** Black plate with white star and wordmark. */
  surface?: "plain" | "black";
  showTagline?: boolean;
  className?: string;
  priority?: boolean;
};

const LOCKUP_WIDTH: Record<GuardianLogoSize, number> = {
  sm: 140,
  md: 200,
  lg: 280,
  xl: 360,
};

const ICON_SIZE: Record<GuardianLogoSize, number> = {
  sm: 22,
  md: 28,
  lg: 36,
  xl: 44,
};

const WORDMARK_HEIGHT: Record<GuardianLogoSize, number> = {
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
};

/**
 * Guardian star + official GUARDIAN wordmark.
 * Horizontal stays compact for headers; lockup uses the stacked asset.
 */
export default function GuardianLogo({
  variant = "horizontal",
  size = "md",
  tone = "light",
  surface = "plain",
  showTagline = false,
  className = "",
  priority = false,
}: Props) {
  const onBlack = surface === "black";
  const markTone: GuardianBrandTone = onBlack ? "dark" : tone;

  if (variant === "horizontal") {
    const iconSize = ICON_SIZE[size];
    const wordmarkHeight = WORDMARK_HEIGHT[size];
    const wordmarkWidth = Math.round(wordmarkHeight * (847 / 112));
    return (
      <span
        className={`inline-flex items-center gap-2 ${
          onBlack ? "rounded-md bg-black px-2 py-1" : ""
        } ${className}`}
      >
        <GuardianIcon
          size={iconSize}
          tone={markTone}
          priority={priority}
          alt=""
        />
        <Image
          src={GUARDIAN_WORDMARK_SRC}
          alt="Guardian"
          width={wordmarkWidth}
          height={wordmarkHeight}
          priority={priority}
          className={guardianBrandToneClass(markTone)}
          style={{ width: wordmarkWidth, height: wordmarkHeight }}
        />
        {showTagline ? (
          <span className="sr-only">{GUARDIAN_BRAND_TAGLINE}</span>
        ) : null}
      </span>
    );
  }

  const width = LOCKUP_WIDTH[size];
  const fullHeight = Math.round(width * (1200 / 1600));
  const croppedHeight = Math.round(width * (1040 / 1600));
  const height = showTagline ? fullHeight : croppedHeight;

  return (
    <span
      className={`inline-flex flex-col items-center ${
        onBlack ? "rounded-xl bg-black p-4 sm:p-5" : ""
      } ${className}`}
    >
      <span
        className="relative block overflow-hidden"
        style={{ width, height }}
      >
        <Image
          src={GUARDIAN_LOGO_SRC}
          alt="Guardian"
          width={1600}
          height={1200}
          priority={priority}
          className={`object-contain object-top ${guardianBrandToneClass(markTone)}`}
          style={{ width: "100%", height: "auto" }}
        />
      </span>
      {showTagline ? (
        <span className="sr-only">{GUARDIAN_BRAND_TAGLINE}</span>
      ) : null}
    </span>
  );
}
