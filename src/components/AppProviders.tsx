"use client";

import { ProfileProvider } from "@/components/ProfileProvider";
import GideonNudge from "@/components/GideonNudge";
import AwardToast from "@/components/AwardToast";
import RetentionWelcomeTrigger from "@/components/RetentionWelcomeTrigger";
import OnboardingGate from "@/components/OnboardingGate";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProfileProvider>
      <OnboardingGate>
        {children}
        <GideonNudge />
        <AwardToast />
        <RetentionWelcomeTrigger />
      </OnboardingGate>
    </ProfileProvider>
  );
}
