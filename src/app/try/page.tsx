import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isOlneyNnoRef, OLNEY_NNO_PATH } from "@/lib/campaigns/olney-nno";

export const metadata: Metadata = {
  title: "Try Guardian",
  description:
    "Try a sample Guardian vault — ask Gideon about demo documents, or create a free account.",
};

type Props = {
  searchParams: Promise<{ ref?: string }>;
};

/** Short public link for sharing Guardian with someone new. */
export default async function TryPage({ searchParams }: Props) {
  const params = await searchParams;
  const ref = params.ref?.trim();
  if (isOlneyNnoRef(ref)) {
    redirect(OLNEY_NNO_PATH);
  }
  if (ref) {
    redirect(`/signup?ref=${encodeURIComponent(ref)}`);
  }
  redirect("/demo");
}
