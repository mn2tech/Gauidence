"use client";

import { ProfileProvider } from "@/components/ProfileProvider";
import GideonNudge from "@/components/GideonNudge";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProfileProvider>
      {children}
      <GideonNudge />
    </ProfileProvider>
  );
}
