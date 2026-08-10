import { redirect } from "next/navigation";
import { vaultsHref } from "@/lib/simple-home/routing";

/** Legacy route — map is now a view on /vaults */
export default function SimpleVaultMapRedirect() {
  redirect(vaultsHref("map"));
}
