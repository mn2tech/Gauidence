import "server-only";

import {
  KNOWN_VEHICLE_PATTERNS,
} from "@/lib/leads/research/catalogs";
import type {
  KnownContractRecord,
  ResearchCandidate,
  ContractVehicleRecord,
} from "@/lib/leads/research/types";

const USA_BASE = "https://api.usaspending.gov/api/v2";
const UA = "Guardian-Leads/1.0 (https://guardian.nm2tech.com; federal partner research)";

export type UsaSpendingRecipient = {
  hash: string;
  legalName: string;
  uei: string | null;
  location: string | null;
  businessTypes: string[];
  recipientLevel: string | null;
};

export type UsaSpendingPacket = {
  recipients: ResearchCandidate[];
  selected: UsaSpendingRecipient | null;
  awards: KnownContractRecord[];
  vehicles: ContractVehicleRecord[];
  agencies: string[];
  naics: Array<{ code: string; title: string }>;
  error: string | null;
};

async function usaFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${USA_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": UA,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 180);
    throw new Error(`USASpending ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.json();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export async function searchUsaSpendingRecipients(
  companyName: string
): Promise<ResearchCandidate[]> {
  const query = companyName.trim();
  if (!query) return [];
  try {
    const body = await usaFetch("/autocomplete/recipient/", {
      method: "POST",
      body: JSON.stringify({ search_text: query.slice(0, 100), limit: 8 }),
    });
    const root = asRecord(body);
    const results = Array.isArray(root?.results) ? root.results : [];
    const candidates: ResearchCandidate[] = [];
    for (const item of results) {
      const row = asRecord(item);
      if (!row) continue;
      const legalName = pickString(row, "recipient_name", "legal_business_name", "name");
      if (!legalName) continue;
      candidates.push({
        legalName,
        uei: pickString(row, "uei", "recipient_uei", "ueiSAM") || null,
        location: pickString(row, "location", "address") || null,
        source: "USASpending.gov",
        recipientHash: pickString(row, "id", "recipient_id", "hash") || null,
      });
    }
    return candidates;
  } catch (err) {
    console.warn("USASpending recipient search failed", {
      message: err instanceof Error ? err.message.slice(0, 180) : "unknown",
    });
    return [];
  }
}

async function loadRecipientProfile(
  hash: string
): Promise<UsaSpendingRecipient | null> {
  if (!hash) return null;
  try {
    const body = await usaFetch(`/recipient/${encodeURIComponent(hash)}/`);
    const row = asRecord(body);
    if (!row) return null;
    const loc = asRecord(row.location);
    const location = loc
      ? [pickString(loc, "city_name", "city"), pickString(loc, "state_code", "state"), pickString(loc, "country_name", "country")]
          .filter(Boolean)
          .join(", ")
      : "";
    const typesRaw = row.business_types ?? row.business_categories;
    const businessTypes = Array.isArray(typesRaw)
      ? typesRaw.map((t) => String(t))
      : [];
    return {
      hash,
      legalName: pickString(row, "name", "recipient_name", "legal_business_name"),
      uei: pickString(row, "uei", "duns", "recipient_uei") || null,
      location: location || null,
      businessTypes,
      recipientLevel: pickString(row, "recipient_level", "level") || null,
    };
  } catch {
    return null;
  }
}

function classifyAwardType(raw: string): KnownContractRecord["contractType"] {
  const t = raw.toLowerCase();
  if (/\btask\s*order\b|\bto\b/.test(t)) return "task_order";
  if (/delivery\s*order|\bdo\b/.test(t)) return "delivery_order";
  if (/\bbpa\b|blanket purchase/.test(t)) return "bpa";
  if (/\bidiq\b|indefinite/.test(t)) return "idiq";
  if (/gwac|vehicle|schedule/.test(t)) return "contract_vehicle";
  if (t) return "standalone_contract";
  return "unknown";
}

function vehicleFromText(text: string): { name: string; type: string } | null {
  for (const item of KNOWN_VEHICLE_PATTERNS) {
    if (item.pattern.test(text)) return { name: item.name, type: item.type };
  }
  return null;
}

export async function loadUsaSpendingPacket(args: {
  companyName: string;
  selectedHash?: string | null;
  selectedUei?: string | null;
}): Promise<UsaSpendingPacket> {
  const recipients = await searchUsaSpendingRecipients(args.companyName);
  const chosen =
    recipients.find((r) => args.selectedHash && r.recipientHash === args.selectedHash) ??
    recipients.find((r) => args.selectedUei && r.uei === args.selectedUei) ??
    recipients[0] ??
    null;

  let selected: UsaSpendingRecipient | null = null;
  if (chosen?.recipientHash) {
    selected = await loadRecipientProfile(chosen.recipientHash);
  }
  if (!selected && chosen) {
    selected = {
      hash: chosen.recipientHash ?? "",
      legalName: chosen.legalName,
      uei: chosen.uei ?? null,
      location: chosen.location ?? null,
      businessTypes: [],
      recipientLevel: null,
    };
  }

  const awards: KnownContractRecord[] = [];
  const vehicles: ContractVehicleRecord[] = [];
  const agencies: string[] = [];
  const naics: Array<{ code: string; title: string }> = [];
  let error: string | null = null;

  const keyword = selected?.legalName || args.companyName;
  const filters: Record<string, unknown> = {
    award_type_codes: ["A", "B", "C", "D", "IDV_A", "IDV_B", "IDV_C", "IDV_D", "IDV_E"],
    time_period: [
      {
        start_date: "2018-01-01",
        end_date: new Date().toISOString().slice(0, 10),
      },
    ],
  };
  if (selected?.uei) {
    filters.recipient_search_text = [selected.legalName];
  } else {
    filters.keyword = keyword;
  }

  try {
    const body = await usaFetch("/search/spending_by_award/", {
      method: "POST",
      body: JSON.stringify({
        filters,
        fields: [
          "Award ID",
          "Recipient Name",
          "Award Amount",
          "Awarding Agency",
          "Awarding Sub Agency",
          "Start Date",
          "End Date",
          "Description",
          "Award Type",
          "Contract Award Type",
          "NAICS",
          "NAICS Description",
        ],
        limit: 25,
        page: 1,
        sort: "Award Amount",
        order: "desc",
      }),
    });
    const root = asRecord(body);
    const results = Array.isArray(root?.results) ? root.results : [];
    const vehicleSeen = new Set<string>();

    for (const item of results) {
      const row = asRecord(item);
      if (!row) continue;
      const awardId = pickString(row, "Award ID", "award_id");
      const desc = pickString(row, "Description", "description");
      const awardType = pickString(row, "Award Type", "Contract Award Type", "award_type");
      const agency = pickString(row, "Awarding Agency", "awarding_agency");
      const subAgency = pickString(row, "Awarding Sub Agency", "awarding_sub_agency");
      const start = pickString(row, "Start Date", "start_date");
      const end = pickString(row, "End Date", "end_date");
      const amount = pickString(row, "Award Amount", "award_amount");
      const naicsCode = pickString(row, "NAICS", "naics");
      const naicsTitle = pickString(row, "NAICS Description", "naics_description");
      const recipient = pickString(row, "Recipient Name", "recipient_name");
      if (agency) agencies.push(agency);
      if (subAgency) agencies.push(subAgency);
      if (naicsCode) naics.push({ code: naicsCode, title: naicsTitle });

      const contractType = classifyAwardType(`${awardType} ${desc}`);
      const now = new Date();
      const endDate = end ? new Date(end) : null;
      const status =
        endDate && !Number.isNaN(endDate.getTime())
          ? endDate >= now
            ? "Active"
            : "Expired"
          : "Unknown";

      if (contractType === "contract_vehicle" || contractType === "idiq" || contractType === "bpa") {
        const detected = vehicleFromText(`${awardId} ${desc} ${awardType}`);
        const name = detected?.name || awardType || awardId || "IDV";
        const key = `${name}|${awardId}`.toLowerCase();
        if (!vehicleSeen.has(key)) {
          vehicleSeen.add(key);
          vehicles.push({
            name,
            contractNumber: awardId,
            vehicleType: detected?.type || (contractType === "bpa" ? "BPA" : contractType === "idiq" ? "IDIQ" : "GWAC"),
            awardingAgency: agency,
            startDate: start,
            endDate: end,
            status,
            source: "USASpending.gov",
            sourceUrl: "https://www.usaspending.gov",
          });
        }
      } else {
        awards.push({
          name: desc.slice(0, 140) || awardId,
          contractNumber: awardId,
          agency: subAgency || agency,
          role: "prime",
          awardValue: amount,
          ceilingValue: "",
          awardDate: start,
          periodOfPerformance: [start, end].filter(Boolean).join(" – "),
          capabilityArea: naicsTitle,
          source: "USASpending.gov",
          sourceUrl: "https://www.usaspending.gov",
          status,
          contractType,
        });
      }

      const detectedVehicle = vehicleFromText(`${awardId} ${desc} ${awardType} ${recipient}`);
      if (detectedVehicle) {
        const key = detectedVehicle.name.toLowerCase();
        if (!vehicleSeen.has(key)) {
          vehicleSeen.add(key);
          vehicles.push({
            name: detectedVehicle.name,
            contractNumber: awardId,
            vehicleType: detectedVehicle.type,
            awardingAgency: agency || "GSA",
            startDate: start,
            endDate: end,
            status,
            source: "USASpending.gov",
            sourceUrl: "https://www.usaspending.gov",
          });
        }
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "USASpending award search failed";
  }

  return {
    recipients,
    selected,
    awards: awards.slice(0, 20),
    vehicles,
    agencies,
    naics,
    error,
  };
}
