"use client";

import { ProfileProvider } from "@/components/ProfileProvider";

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProfileProvider>{children}</ProfileProvider>;
}
