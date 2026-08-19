import "server-only";

import { statusesFromSamCodes } from "@/lib/leads/research/normalize";
import type {
  NaicsEntry,
  ResearchCandidate,
  ResearchOpportunityRecord,
} from "@/lib/leads/research/types";

const ENTITY_URL = "https://api.sam.gov/entity-information/v3/entities";
const OPP_URL = "https://api.sam.gov/opportunities/v2/search";

export function isSamConfigured(): boolean {
  return Boolean(process.env.SAM_GOV_API_KEY?.trim());
}

function samKey(): string {
  return process.env.SAM_GOV_API_KEY?.trim() ?? "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(row: Record<string, unknown> | null, ...keys: string[]): string {
  if (!row) return "";
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export type SamEntity = {
  uei: string;
  cageCode: string;
  legalName: string;
  dbaName: string;
  website: string;
  headquarters: string;
  registrationStatus: string;
  naics: NaicsEntry[];
  smallBusinessStatuses: string[];
  sourceUrl: string;
};

export type SamPacket = {
  configured: boolean;
  entities: SamEntity[];
  opportunities: ResearchOpportunityRecord[];
  error: string | null;
};

async function samGet(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Guardian-Leads/1.0 (https://guardian.nm2tech.com)",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 180);
    throw new Error(`SAM.gov ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.json();
}

function parseEntity(raw: unknown): SamEntity | null {
  const row = asRecord(raw);
  if (!row) return null;
  const registration = asRecord(row.entityRegistration);
  const core = asRecord(row.coreData);
  const assertions = asRecord(row.assertions);
  const info = asRecord(core?.entityInformation ?? null);
  const addr =
    asRecord(registration?.physicalAddress ?? null) ??
    asRecord(core?.physicalAddress ?? null);
  const uei = pickString(registration, "ueiSAM", "uei");
  const legalName = pickString(registration, "legalBusinessName", "legalName");
  if (!uei && !legalName) return null;

  const goods = asRecord(assertions?.goodsAndServices ?? null);
  const naicsRaw = Array.isArray(goods?.naicsList) ? goods.naicsList : [];
  const naics: NaicsEntry[] = naicsRaw
    .map((item) => {
      const n = asRecord(item);
      if (!n) return null;
      const code = pickString(n, "naicsCode", "code");
      if (!code) return null;
      return {
        code: code.replace(/\D/g, "").slice(0, 6),
        title: pickString(n, "naicsDescription", "title"),
        isPrimary: Boolean(n.isPrimary ?? n.primary),
      };
    })
    .filter((n): n is NaicsEntry => n != null && n.code.length >= 5);

  const types =
    asRecord(core?.businessTypes ?? null)?.businessTypeList ??
    registration?.businessTypes;
  const codes: string[] = [];
  if (Array.isArray(types)) {
    for (const item of types) {
      if (typeof item === "string") codes.push(item);
      else {
        const t = asRecord(item);
        const code = pickString(t, "businessTypeCode", "code");
        if (code) codes.push(code);
      }
    }
  }

  const hq = addr
    ? [
        pickString(addr, "city", "cityName"),
        pickString(addr, "stateOrProvinceCode", "state"),
        pickString(addr, "zipCode", "zip"),
        pickString(addr, "countryCode", "country"),
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  return {
    uei,
    cageCode: pickString(registration, "cageCode"),
    legalName,
    dbaName: pickString(registration, "dbaName"),
    website: pickString(info, "entityURL", "website", "url"),
    headquarters: hq,
    registrationStatus: pickString(registration, "registrationStatus", "ueiStatus"),
    naics,
    smallBusinessStatuses: statusesFromSamCodes(codes),
    sourceUrl: uei
      ? `https://sam.gov/entity/${encodeURIComponent(uei)}`
      : "https://sam.gov",
  };
}

export async function searchSamEntities(args: {
  companyName?: string;
  uei?: string | null;
  cageCode?: string | null;
}): Promise<SamEntity[]> {
  if (!isSamConfigured()) return [];
  const params = new URLSearchParams({
    api_key: samKey(),
    includeSections: "entityRegistration,coreData,assertions",
    registrationStatus: "A",
    page: "0",
    size: "8",
  });
  if (args.uei) params.set("ueiSAM", args.uei);
  else if (args.cageCode) params.set("cageCode", args.cageCode);
  else if (args.companyName) params.set("legalBusinessName", args.companyName.slice(0, 120));
  else return [];

  const body = await samGet(`${ENTITY_URL}?${params.toString()}`);
  const root = asRecord(body);
  const list = Array.isArray(root?.entityData) ? root.entityData : [];
  return list.map(parseEntity).filter((e): e is SamEntity => e != null);
}

function formatMmDdYyyy(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

export async function searchSamOpportunities(args: {
  companyName: string;
  uei?: string | null;
  naics?: string[];
}): Promise<ResearchOpportunityRecord[]> {
  if (!isSamConfigured()) return [];
  const postedTo = new Date();
  const postedFrom = new Date();
  postedFrom.setDate(postedFrom.getDate() - 30);
  const params = new URLSearchParams({
    api_key: samKey(),
    limit: "10",
    postedFrom: formatMmDdYyyy(postedFrom),
    postedTo: formatMmDdYyyy(postedTo),
    q: args.companyName.slice(0, 80),
  });
  if (args.naics?.[0]) params.set("ncode", args.naics[0]);

  const body = await samGet(`${OPP_URL}?${params.toString()}`);
  const root = asRecord(body);
  const list = Array.isArray(root?.opportunitiesData)
    ? root.opportunitiesData
    : Array.isArray(root?.opportunities)
      ? root.opportunities
      : [];

  const out: ResearchOpportunityRecord[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const title = pickString(row, "title", "solicitationTitle");
    const notice = pickString(row, "solicitationNumber", "noticeId", "relatedNoticeId");
    if (!title && !notice) continue;
    const org = asRecord(row.organizationHierarchy ?? row.fullParentPathName ?? null);
    out.push({
      title: title || notice,
      noticeNumber: notice,
      agency:
        pickString(row, "fullParentPathName", "department", "organizationName") ||
        pickString(org, "department", "name"),
      dueDate: pickString(row, "responseDeadLine", "responseDeadline", "dueDate"),
      naics: pickString(row, "naicsCode", "naics"),
      setAside: pickString(row, "typeOfSetAside", "setAside", "typeOfSetAsideDescription"),
      estimatedValue: pickString(row, "award", "estimatedValue"),
      relevantCapability: "",
      sourceUrl:
        pickString(row, "uiLink", "descriptionLink") ||
        (notice ? `https://sam.gov/opp/${encodeURIComponent(notice)}` : "https://sam.gov"),
      nm2techMatch: "",
    });
  }
  return out.slice(0, 10);
}

export async function loadSamPacket(args: {
  companyName: string;
  uei?: string | null;
  cageCode?: string | null;
}): Promise<SamPacket> {
  if (!isSamConfigured()) {
    return { configured: false, entities: [], opportunities: [], error: null };
  }
  try {
    const entities = await searchSamEntities(args);
    const opportunities = await searchSamOpportunities({
      companyName: entities[0]?.legalName || args.companyName,
      uei: entities[0]?.uei || args.uei,
      naics: entities[0]?.naics.map((n) => n.code),
    }).catch(() => [] as ResearchOpportunityRecord[]);
    return { configured: true, entities, opportunities, error: null };
  } catch (err) {
    return {
      configured: true,
      entities: [],
      opportunities: [],
      error: err instanceof Error ? err.message : "SAM.gov lookup failed",
    };
  }
}

export function samEntitiesToCandidates(entities: SamEntity[]): ResearchCandidate[] {
  return entities.map((e) => ({
    legalName: e.legalName,
    uei: e.uei || null,
    cageCode: e.cageCode || null,
    location: e.headquarters || null,
    website: e.website || null,
    source: "SAM.gov",
  }));
}
