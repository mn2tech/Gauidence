import Image from "next/image";

type Props = {
  size?: number;
  className?: string;
  pulse?: boolean;
  /** Shield icon (default) or portrait in chat replies / typing. */
  variant?: "shield" | "portrait";
};

/** Gideon avatar — shield icon by default; portrait in Ask Gideon chat thread. */
export default function GideonAvatar({
  size = 32,
  className = "",
  pulse = false,
  variant = "shield",
}: Props) {
  if (variant === "portrait") {
    return (
      <span
        className={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-stone-100 ring-1 ring-brand/30 ${className}`}
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
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-light ring-1 ring-brand/25 ${pulse ? "animate-pulse" : ""} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        width={Math.round(size * 0.55)}
        height={Math.round(size * 0.55)}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 2.5L4.5 5.5v5.2c0 5.1 3.3 9.7 7.5 10.8 4.2-1.1 7.5-5.7 7.5-10.8V5.5L12 2.5z"
          className="fill-brand"
          opacity="0.9"
        />
        <path
          d="M12 6.2v9.2M9.2 11.2h5.6"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
