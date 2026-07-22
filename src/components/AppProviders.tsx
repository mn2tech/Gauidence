"use client";

import { ProfileProvider } from "@/components/ProfileProvider";
import GideonNudge from "@/components/GideonNudge";
import AwardToast from "@/components/AwardToast";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProfileProvider>
      {children}
      <GideonNudge />
      <AwardToast />
    </ProfileProvider>
  );
}
