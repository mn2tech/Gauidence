import { redirect } from "next/navigation";
import { HISTORY_PATH } from "@/lib/simple-home/routing";

/** Legacy Daily Log entry → History (non-breaking bookmark). */
export default function DailyLogRedirectPage() {
  redirect(HISTORY_PATH);
}
