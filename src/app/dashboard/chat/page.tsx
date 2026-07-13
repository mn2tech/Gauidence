import { redirect } from "next/navigation";

/** Legacy route — Ask Gideon lives at /ask. */
export default function VaultChatRedirect() {
  redirect("/ask");
}
