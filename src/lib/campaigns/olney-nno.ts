import { appBaseUrl } from "@/lib/profiles/invitations";

/** Signup attribution ref for Olney National Night Out booth traffic. */
export const OLNEY_NNO_REF = "olney-nno";

export const OLNEY_NNO_PATH = "/olney";

export function isOlneyNnoRef(ref: string | null | undefined): boolean {
  return ref?.trim() === OLNEY_NNO_REF;
}

export function olneyNnoSignupPath(): string {
  return `/signup?ref=${encodeURIComponent(OLNEY_NNO_REF)}`;
}

export function olneyNnoPublicUrl(): string {
  return `${appBaseUrl()}${OLNEY_NNO_PATH}`;
}

export function campaignSignupWelcome(ref: string | null | undefined): string | null {
  if (isOlneyNnoRef(ref)) {
    return "Welcome from Olney National Night Out — your complimentary Guardian access starts free. No credit card needed.";
  }
  return null;
}
