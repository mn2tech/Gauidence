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
  sm: 32,
  md: 36,
  lg: 44,
  xl: 52,
};

const WORDMARK_HEIGHT: Record<GuardianLogoSize, number> = {
  sm: 16,
  md: 18,
  lg: 22,
  xl: 26,
};

/**
 * Guardian star + official GUARDIAN wordmark.
 * Horizontal stays compact for headers; lockup uses the stacked asset.
 */
export default function GuardianLogo({
  variant = "horizontal",
  size = "md",
  tone = "light",
  showTagline = false,
  className = "",
  priority = false,
}: Props) {
  if (variant === "horizontal") {
    const iconSize = ICON_SIZE[size];
    const wordmarkHeight = WORDMARK_HEIGHT[size];
    const wordmarkWidth = Math.round(wordmarkHeight * (847 / 112));
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <GuardianIcon
          size={iconSize}
          tone={tone}
          priority={priority}
          alt=""
        />
        <Image
          src={GUARDIAN_WORDMARK_SRC}
          alt="Guardian"
          width={wordmarkWidth}
          height={wordmarkHeight}
          priority={priority}
          className={guardianBrandToneClass(tone)}
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
  const wordmarkHeight = Math.round(width * (1040 / 1600));
  const height = showTagline ? fullHeight : wordmarkHeight;

  return (
    <span className={`inline-flex flex-col items-center ${className}`}>
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
          className={`object-contain object-top ${guardianBrandToneClass(tone)}`}
          style={{ width: "100%", height: "auto" }}
        />
      </span>
      {showTagline ? (
        <span className="sr-only">{GUARDIAN_BRAND_TAGLINE}</span>
      ) : null}
    </span>
  );
}
