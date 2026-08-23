"use client";

import AnalyticsProvider from "@/components/AnalyticsProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { UpgradeProvider } from "@/components/UpgradeProvider";
import GideonNudge from "@/components/GideonNudge";
import AwardToast from "@/components/AwardToast";
import RetentionWelcomeTrigger from "@/components/RetentionWelcomeTrigger";
import OnboardingGate from "@/components/OnboardingGate";
import AiNoticeGate from "@/components/legal/AiNoticeGate";
import GuardianStartSplash from "@/components/brand/GuardianStartSplash";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AnalyticsProvider>
      <ProfileProvider>
        <UpgradeProvider>
          <OnboardingGate>
            <AiNoticeGate>
              {children}
              <GuardianStartSplash />
              <GideonNudge />
              <AwardToast />
              <RetentionWelcomeTrigger />
            </AiNoticeGate>
          </OnboardingGate>
        </UpgradeProvider>
      </ProfileProvider>
    </AnalyticsProvider>
  );
}
