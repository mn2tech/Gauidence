import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Try Guardian",
  description:
    "Create a free Guardian account — upload documents, track deadlines, and ask Gideon in plain language.",
};

type Props = {
  searchParams: Promise<{ ref?: string }>;
};

/** Short public link for sharing Guardian with someone new. */
export default async function TryPage({ searchParams }: Props) {
  const params = await searchParams;
  const ref = params.ref?.trim();
  if (ref) {
    redirect(`/signup?ref=${encodeURIComponent(ref)}`);
  }
  redirect("/signup");
}
