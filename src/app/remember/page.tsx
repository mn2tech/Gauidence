import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HISTORY_PATH } from "@/lib/simple-home/routing";

export const metadata: Metadata = {
  title: "Remember Today — Guardian",
  description: "Capture what happened — now part of History.",
};

/** Remember Today is History + Tell Guardian (bookmark-safe redirect). */
export default function RememberPage() {
  redirect(`${HISTORY_PATH}?tell=1`);
}
