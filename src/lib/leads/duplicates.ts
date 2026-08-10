import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAD_SELECT, type BusinessLead } from "@/lib/leads/types";

export type DuplicateCandidate = {
  email?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  website?: string | null;
};

export type DuplicateMatch = {
  lead: BusinessLead;
  reasons: string[];
};

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().toLowerCase();
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

function normalizeWebsite(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  let host = value.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "");
  host = host.replace(/^www\./, "");
  host = host.split("/")[0] ?? host;
  return host.length > 0 ? host : null;
}

function normalizeName(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findDuplicateReasons(
  candidate: DuplicateCandidate,
  existing: BusinessLead
): string[] {
  const reasons: string[] = [];

  const email = normalizeEmail(candidate.email);
  const existingEmail = normalizeEmail(existing.email);
  if (email && existingEmail && email === existingEmail) {
    reasons.push("email");
  }

  const phone = normalizePhone(candidate.phone);
  const existingPhone = normalizePhone(existing.phone);
  if (phone && existingPhone && phone === existingPhone) {
    reasons.push("phone");
  }

  const website = normalizeWebsite(candidate.website);
  const existingWebsite = normalizeWebsite(existing.website);
  if (website && existingWebsite && website === existingWebsite) {
    reasons.push("website");
  }

  const company = normalizeName(candidate.companyName);
  const contact = normalizeName(candidate.contactName);
  const existingCompany = normalizeName(existing.company_name);
  const existingContact = normalizeName(existing.contact_name);
  if (
    company &&
    contact &&
    existingCompany &&
    existingContact &&
    company === existingCompany &&
    contact === existingContact
  ) {
    reasons.push("company_and_contact");
  }

  return reasons;
}

export async function findPotentialDuplicates(
  supabase: SupabaseClient,
  businessProfileId: string,
  candidate: DuplicateCandidate,
  limit = 5
): Promise<DuplicateMatch[]> {
  const { data, error } = await supabase
    .from("business_leads")
    .select(LEAD_SELECT)
    .eq("business_profile_id", businessProfileId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const matches: DuplicateMatch[] = [];
  for (const lead of (data ?? []) as BusinessLead[]) {
    const reasons = findDuplicateReasons(candidate, lead);
    if (reasons.length > 0) {
      matches.push({ lead, reasons });
    }
    if (matches.length >= limit) break;
  }
  return matches;
}
