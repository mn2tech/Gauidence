import Image from "next/image";
import GuardianIcon from "@/components/brand/GuardianIcon";

type Props = {
  size?: number;
  className?: string;
  pulse?: boolean;
  /** Star mark (default) or portrait in chat replies / typing. */
  variant?: "shield" | "mark" | "portrait";
};

/** Gideon avatar — Guardian star by default; portrait in Ask Gideon chat thread. */
export default function GideonAvatar({
  size = 32,
  className = "",
  pulse = false,
  variant = "mark",
}: Props) {
  if (variant === "portrait") {
    return (
      <span
        className={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-stone-100 ring-1 ring-stone-200 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <Image
          src="/gideon/avatar.png"
          alt=""
          width={size}
          height={size}
          className={`h-full w-full object-cover object-center ${pulse ? "animate-pulse" : ""}`}
          sizes={`${size}px`}
        />
      </span>
    );
  }

  return (
    <GuardianIcon size={size} pulse={pulse} className={className} alt="" />
  );
}
