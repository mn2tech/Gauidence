import Link from "next/link";
import {
  normalizePlanLimitMessage,
  shouldShowPlanUpgradeLink,
} from "@/lib/billing/limitError";

type Props = {
  message: string;
  code?: string | null;
  className?: string;
};

/** Quota error with an inline upgrade link when the monthly plan limit is hit. */
export default function PlanLimitAlert({ message, code, className }: Props) {
  const showUpgrade = shouldShowPlanUpgradeLink(message, code);
  const displayMessage = showUpgrade
    ? normalizePlanLimitMessage(message)
    : message;

  return (
    <p role="alert" className={className}>
      <span>{displayMessage}</span>
      {showUpgrade ? (
        <>
          {" "}
          <Link
            href="/settings#billing"
            className="font-semibold text-brand underline-offset-2 hover:text-brand-dark hover:underline"
          >
            Upgrade
          </Link>
        </>
      ) : null}
    </p>
  );
}
