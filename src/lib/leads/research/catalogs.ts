import type { SmallBusinessStatusOption } from "@/lib/leads/research/types";

export type AgencyCatalogEntry = {
  canonical: string;
  aliases: string[];
  bureaus: Array<{ canonical: string; aliases: string[] }>;
};

export const AGENCY_CATALOG: AgencyCatalogEntry[] = [
  {
    canonical: "Department of the Treasury",
    aliases: [
      "treasury",
      "department of treasury",
      "dept of treasury",
      "dept. of the treasury",
      "u.s. treasury",
      "us treasury",
      "ustreasury",
      "department of the treasury",
    ],
    bureaus: [
      { canonical: "Internal Revenue Service", aliases: ["irs"] },
      {
        canonical: "Alcohol and Tobacco Tax and Trade Bureau",
        aliases: ["ttb"],
      },
      {
        canonical: "Financial Crimes Enforcement Network",
        aliases: ["fincen"],
      },
      { canonical: "Bureau of the Fiscal Service", aliases: ["bfs", "fiscal service"] },
      { canonical: "Office of the Comptroller of the Currency", aliases: ["occ"] },
    ],
  },
  {
    canonical: "Department of Homeland Security",
    aliases: ["dhs", "homeland security", "department of homeland security"],
    bureaus: [
      { canonical: "Cybersecurity and Infrastructure Security Agency", aliases: ["cisa"] },
      { canonical: "Transportation Security Administration", aliases: ["tsa"] },
      { canonical: "U.S. Customs and Border Protection", aliases: ["cbp"] },
      { canonical: "U.S. Immigration and Customs Enforcement", aliases: ["ice"] },
      { canonical: "Federal Emergency Management Agency", aliases: ["fema"] },
      { canonical: "U.S. Citizenship and Immigration Services", aliases: ["uscis"] },
      { canonical: "U.S. Secret Service", aliases: ["uss", "secret service"] },
    ],
  },
  {
    canonical: "Department of Defense",
    aliases: ["dod", "department of defense", "defense"],
    bureaus: [
      { canonical: "Department of the Army", aliases: ["army"] },
      { canonical: "Department of the Navy", aliases: ["navy"] },
      { canonical: "Department of the Air Force", aliases: ["air force", "usaf"] },
      { canonical: "Defense Information Systems Agency", aliases: ["disa"] },
      { canonical: "Defense Logistics Agency", aliases: ["dla"] },
      { canonical: "U.S. Marine Corps", aliases: ["usmc", "marines"] },
    ],
  },
  {
    canonical: "Department of Health and Human Services",
    aliases: ["hhs", "health and human services", "department of health and human services"],
    bureaus: [
      { canonical: "Centers for Medicare & Medicaid Services", aliases: ["cms"] },
      { canonical: "National Institutes of Health", aliases: ["nih"] },
      { canonical: "Centers for Disease Control and Prevention", aliases: ["cdc"] },
      { canonical: "Food and Drug Administration", aliases: ["fda"] },
    ],
  },
  {
    canonical: "Department of Veterans Affairs",
    aliases: ["va", "veterans affairs", "department of veterans affairs"],
    bureaus: [],
  },
  {
    canonical: "Department of Justice",
    aliases: ["doj", "department of justice", "justice"],
    bureaus: [
      { canonical: "Federal Bureau of Investigation", aliases: ["fbi"] },
      { canonical: "Drug Enforcement Administration", aliases: ["dea"] },
    ],
  },
  {
    canonical: "Department of Commerce",
    aliases: ["commerce", "department of commerce", "doc"],
    bureaus: [
      { canonical: "National Institute of Standards and Technology", aliases: ["nist"] },
      { canonical: "Census Bureau", aliases: ["census"] },
    ],
  },
  {
    canonical: "Department of Energy",
    aliases: ["doe", "department of energy", "energy"],
    bureaus: [],
  },
  {
    canonical: "Department of State",
    aliases: ["state", "department of state", "dos", "state department"],
    bureaus: [],
  },
  {
    canonical: "Department of Transportation",
    aliases: ["dot", "department of transportation", "transportation"],
    bureaus: [{ canonical: "Federal Aviation Administration", aliases: ["faa"] }],
  },
  {
    canonical: "Department of Agriculture",
    aliases: ["usda", "agriculture", "department of agriculture"],
    bureaus: [],
  },
  {
    canonical: "Department of the Interior",
    aliases: ["doi", "interior", "department of the interior"],
    bureaus: [],
  },
  {
    canonical: "Department of Labor",
    aliases: ["dol", "labor", "department of labor"],
    bureaus: [],
  },
  {
    canonical: "Department of Education",
    aliases: ["ed", "education", "department of education"],
    bureaus: [],
  },
  {
    canonical: "Department of Housing and Urban Development",
    aliases: ["hud", "housing and urban development"],
    bureaus: [],
  },
  {
    canonical: "General Services Administration",
    aliases: ["gsa", "general services administration"],
    bureaus: [{ canonical: "Federal Acquisition Service", aliases: ["fas"] }],
  },
  {
    canonical: "National Aeronautics and Space Administration",
    aliases: ["nasa"],
    bureaus: [],
  },
  {
    canonical: "Social Security Administration",
    aliases: ["ssa", "social security"],
    bureaus: [],
  },
  {
    canonical: "Small Business Administration",
    aliases: ["sba", "small business administration"],
    bureaus: [],
  },
  {
    canonical: "Office of Personnel Management",
    aliases: ["opm"],
    bureaus: [],
  },
  {
    canonical: "Environmental Protection Agency",
    aliases: ["epa", "environmental protection agency"],
    bureaus: [],
  },
  {
    canonical: "Office of the Director of National Intelligence",
    aliases: ["odni", "dni"],
    bureaus: [],
  },
];

export const CAPABILITY_CATALOG: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "ICAM", aliases: ["identity", "access management", "iam", "identity credential"] },
  { canonical: "Cybersecurity", aliases: ["cyber", "infosec", "information security"] },
  { canonical: "Zero Trust", aliases: ["zero-trust", "zta"] },
  { canonical: "Cloud Modernization", aliases: ["cloud migration", "cloud transformation"] },
  { canonical: "DevSecOps", aliases: ["devsecops", "ci/cd"] },
  { canonical: "Digital Identity", aliases: ["digital id", "identity proofing"] },
  { canonical: "Data Engineering", aliases: ["etl", "elt", "data pipeline", "data pipelines"] },
  { canonical: "Data Analytics", aliases: ["analytics", "business intelligence", "bi"] },
  { canonical: "Data Governance", aliases: ["data quality", "master data"] },
  { canonical: "AI/ML", aliases: ["artificial intelligence", "machine learning", "ml"] },
  { canonical: "Software Development", aliases: ["application development", "app dev", "custom software"] },
  { canonical: "Enterprise IT", aliases: ["enterprise infrastructure", "it operations"] },
  { canonical: "Systems Engineering", aliases: ["systems integration"] },
  { canonical: "Cloud Engineering", aliases: ["cloud architecture"] },
  { canonical: "Federal Technical Staffing", aliases: ["staffing", "it staffing"] },
];

export const TECHNOLOGY_CATALOG: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "Azure", aliases: ["microsoft azure"] },
  { canonical: "AWS", aliases: ["amazon web services"] },
  { canonical: "GCP", aliases: ["google cloud", "google cloud platform"] },
  { canonical: "SAS", aliases: ["sas viya"] },
  { canonical: "Databricks", aliases: [] },
  { canonical: "Snowflake", aliases: [] },
  { canonical: "PostgreSQL", aliases: ["postgres"] },
  { canonical: "Kubernetes", aliases: ["k8s"] },
  { canonical: "AI/ML", aliases: ["machine learning"] },
  { canonical: "GenAI", aliases: ["generative ai", "llm"] },
  { canonical: "DevSecOps", aliases: [] },
  { canonical: "ICAM", aliases: [] },
  { canonical: "Zero Trust", aliases: ["zero-trust"] },
];

export const PAST_PERFORMANCE_TAGS = [
  "Data Analytics",
  "Data Governance",
  "ICAM",
  "Cybersecurity",
  "Cloud Modernization",
  "AI/ML",
  "DevSecOps",
  "Software Development",
  "Enterprise IT",
  "Systems Engineering",
] as const;

export const NAICS_TITLES: Record<string, string> = {
  "541511": "Custom Computer Programming Services",
  "541512": "Computer Systems Design Services",
  "541513": "Computer Facilities Management Services",
  "541519": "Other Computer Related Services",
  "541611": "Administrative Management and General Management Consulting Services",
  "541618": "Other Management Consulting Services",
  "541690": "Other Scientific and Technical Consulting Services",
  "541715": "Research and Development in the Physical, Engineering, and Life Sciences",
  "518210": "Computing Infrastructure Providers, Data Processing, Web Hosting, and Related Services",
  "541330": "Engineering Services",
  "561320": "Temporary Help Services",
  "541990": "All Other Professional, Scientific, and Technical Services",
};

/** SAM.gov entity business-type codes → Guardian small-business statuses. */
export const SAM_BUSINESS_TYPE_MAP: Record<string, SmallBusinessStatusOption> = {
  "2X": "Small Business",
  "27": "SDB",
  "23": "SDB",
  A6: "8(a)",
  A2: "WOSB",
  A4: "WOSB",
  A5: "EDWOSB",
  XX: "HUBZone",
  QF: "SDVOSB",
  A7: "VOSB",
  Q5: "VOSB",
  "8W": "WOSB",
  "8C": "SDB",
  "8A": "8(a)",
  "2F": "ANC",
  "2C": "ANC",
};

export const NM2TECH_CAPABILITIES = [
  "AI/ML",
  "Data Engineering",
  "Data Analytics",
  "SAS / SAS Viya",
  "Azure",
  "Cloud Engineering",
  "Application Development",
  "Data Governance",
  "Federal technical staffing",
] as const;

export const NM2TECH_TECHNOLOGIES = [
  "Azure",
  "AWS",
  "PostgreSQL",
  "SAS",
  "AI/ML",
  "GenAI",
] as const;

export const NM2TECH_TARGET_AGENCIES = [
  "Department of the Treasury",
  "Department of Homeland Security",
  "Department of Defense",
  "Department of Veterans Affairs",
  "Department of Health and Human Services",
  "General Services Administration",
] as const;

export const NM2TECH_NAICS = ["541511", "541512", "541519", "541611", "518210"];

export const KNOWN_VEHICLE_PATTERNS: Array<{ pattern: RegExp; name: string; type: string }> = [
  { pattern: /stars\s*iii/i, name: "GSA 8(a) STARS III", type: "GWAC" },
  { pattern: /stars\s*ii\b/i, name: "GSA 8(a) STARS II", type: "GWAC" },
  { pattern: /\boasis\s*\+|oasis\s*plus/i, name: "GSA OASIS+", type: "GWAC" },
  { pattern: /\boasis\b/i, name: "GSA OASIS", type: "GWAC" },
  { pattern: /alliant\s*3/i, name: "GSA Alliant 3", type: "GWAC" },
  { pattern: /alliant\s*2/i, name: "GSA Alliant 2", type: "GWAC" },
  { pattern: /cio-?sp3/i, name: "NITAAC CIO-SP3", type: "GWAC" },
  { pattern: /cio-?sp4/i, name: "NITAAC CIO-SP4", type: "GWAC" },
  { pattern: /\bsewp\b/i, name: "NASA SEWP", type: "GWAC" },
  { pattern: /ites-?3s/i, name: "Army ITES-3S", type: "IDIQ" },
  { pattern: /ites-?4s/i, name: "Army ITES-4S", type: "IDIQ" },
  { pattern: /gsa\s*schedule|multiple\s*award\s*schedule|\bmas\b/i, name: "GSA Multiple Award Schedule", type: "Schedule" },
  { pattern: /8\(a\)\s*stars/i, name: "GSA 8(a) STARS III", type: "GWAC" },
];
