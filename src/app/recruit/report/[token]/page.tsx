import type { Metadata } from "next";
import SharedRecruitReportClient from "@/components/recruit/SharedRecruitReportClient";

export const metadata: Metadata = {
  title: "Shortlist report — Guardian Recruit",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function SharedRecruitReportPage({ params }: Props) {
  const { token } = await params;
  return <SharedRecruitReportClient token={token} />;
}
