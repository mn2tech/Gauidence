/**
 * Sample inbox items for the Inbox UI shell (no live email sync yet).
 * Filters map to Spaces + a few smart buckets (Bills, School, Unsorted).
 */

export type InboxSmartBucket = "bills" | "school" | "work";

export type InboxMockMessage = {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  preview: string;
  /** ISO date string */
  receivedAt: string;
  needsAttention: boolean;
  /** Smart category when not yet filed to a Space */
  bucket: InboxSmartBucket | null;
  /** Filed Space id, or null = Unsorted */
  assignedSpaceId: string | null;
  /** Gideon’s suggested Space when unsorted */
  suggestedSpaceId: string | null;
  suggestedSpaceLabel: string | null;
};

export type InboxFilterId =
  | "all"
  | "needs_attention"
  | "unsorted"
  | "bills"
  | "school"
  | `space:${string}`;

export type InboxSpaceOption = {
  id: string;
  display_name: string;
  profile_type: string;
};

/** Deterministic sample threads; Space ids remapped to the user’s real Spaces when possible. */
export const INBOX_MOCK_SEED: Omit<
  InboxMockMessage,
  "assignedSpaceId" | "suggestedSpaceId"
>[] = [
  {
    id: "mock-mcps-1",
    fromName: "MCPS Parent Portal",
    fromEmail: "noreply@montgomeryschoolsmd.org",
    subject: "Absence reported for Wednesday",
    preview:
      "An absence was recorded for your student. Please confirm or provide a note in ParentVUE.",
    receivedAt: "2026-09-03T14:22:00.000Z",
    needsAttention: true,
    bucket: "school",
    suggestedSpaceLabel: "School",
  },
  {
    id: "mock-mcps-2",
    fromName: "School Lunch",
    fromEmail: "meals@montgomeryschoolsmd.org",
    subject: "Low meal account balance",
    preview:
      "Your student’s meal account is below $10. Add funds online to avoid interruptions.",
    receivedAt: "2026-09-02T11:05:00.000Z",
    needsAttention: true,
    bucket: "school",
    suggestedSpaceLabel: "School",
  },
  {
    id: "mock-bge",
    fromName: "BGE",
    fromEmail: "noreply@bge.com",
    subject: "Your bill is ready — $142.18 due Sep 18",
    preview:
      "Your electronic bill is available. Pay by Sep 18 to avoid a late fee.",
    receivedAt: "2026-09-01T16:40:00.000Z",
    needsAttention: true,
    bucket: "bills",
    suggestedSpaceLabel: "Personal",
  },
  {
    id: "mock-water",
    fromName: "WSSC Water",
    fromEmail: "billing@wsscwater.com",
    subject: "Water bill statement",
    preview: "Your latest statement is attached. Amount due: $68.40.",
    receivedAt: "2026-08-28T09:12:00.000Z",
    needsAttention: false,
    bucket: "bills",
    suggestedSpaceLabel: "Personal",
  },
  {
    id: "mock-client",
    fromName: "Shannon Yang",
    fromEmail: "shannon@keysinvestments.com",
    subject: "Re: Demo reschedule",
    preview:
      "Can we lock a new time this week? Looking at Thursday afternoon if that still works.",
    receivedAt: "2026-09-04T01:10:00.000Z",
    needsAttention: true,
    bucket: "work",
    suggestedSpaceLabel: "Business",
  },
  {
    id: "mock-chamber",
    fromName: "Olney Chamber",
    fromEmail: "info@olneymd.org",
    subject: "Member event reminder — networking breakfast",
    preview:
      "Reminder: networking breakfast is next Tuesday at 8:00 AM. RSVP if you haven’t already.",
    receivedAt: "2026-09-03T18:00:00.000Z",
    needsAttention: false,
    bucket: "work",
    suggestedSpaceLabel: "Business",
  },
  {
    id: "mock-promo",
    fromName: "Costco",
    fromEmail: "offers@costco.com",
    subject: "This week’s warehouse savings",
    preview: "Member-only deals on appliances and seasonal items through Sunday.",
    receivedAt: "2026-09-03T08:00:00.000Z",
    needsAttention: false,
    bucket: null,
    suggestedSpaceLabel: null,
  },
];

function pickSpaceId(
  spaces: InboxSpaceOption[],
  prefer: (s: InboxSpaceOption) => boolean
): string | null {
  return spaces.find(prefer)?.id ?? spaces[0]?.id ?? null;
}

/** Bind mock threads to the user’s Spaces (school → child/student, work → business, etc.). */
export function buildInboxMockMessages(
  spaces: InboxSpaceOption[]
): InboxMockMessage[] {
  const schoolId = pickSpaceId(
    spaces,
    (s) =>
      s.profile_type === "child" ||
      s.profile_type === "student" ||
      s.profile_type === "family" ||
      /mcps|school/i.test(s.display_name)
  );
  const personalId = pickSpaceId(
    spaces,
    (s) => s.profile_type === "personal" || s.profile_type === "home"
  );
  const workId = pickSpaceId(
    spaces,
    (s) =>
      s.profile_type === "business" ||
      s.profile_type === "nonprofit" ||
      s.profile_type === "client"
  );

  const suggestFor = (
    bucket: InboxSmartBucket | null,
    label: string | null
  ): { id: string | null; label: string | null } => {
    if (bucket === "school") {
      const space = spaces.find((s) => s.id === schoolId);
      return { id: schoolId, label: space?.display_name ?? label };
    }
    if (bucket === "bills") {
      const space = spaces.find((s) => s.id === personalId);
      return { id: personalId, label: space?.display_name ?? label };
    }
    if (bucket === "work") {
      const space = spaces.find((s) => s.id === workId);
      return { id: workId, label: space?.display_name ?? label };
    }
    return { id: null, label: null };
  };

  return INBOX_MOCK_SEED.map((seed) => {
    const suggested = suggestFor(seed.bucket, seed.suggestedSpaceLabel);
    // First school + bills items stay unsorted so Unsorted / suggest UX is visible.
    const prefiled =
      seed.id === "mock-chamber" && workId
        ? workId
        : seed.id === "mock-water" && personalId
          ? personalId
          : null;

    return {
      ...seed,
      assignedSpaceId: prefiled,
      suggestedSpaceId: suggested.id,
      suggestedSpaceLabel: suggested.label,
    };
  });
}

export function filterInboxMessages(
  messages: InboxMockMessage[],
  filter: InboxFilterId
): InboxMockMessage[] {
  switch (filter) {
    case "all":
      return messages;
    case "needs_attention":
      return messages.filter((m) => m.needsAttention);
    case "unsorted":
      return messages.filter((m) => m.assignedSpaceId == null);
    case "bills":
      return messages.filter((m) => m.bucket === "bills");
    case "school":
      return messages.filter((m) => m.bucket === "school");
    default:
      if (filter.startsWith("space:")) {
        const spaceId = filter.slice("space:".length);
        return messages.filter(
          (m) =>
            m.assignedSpaceId === spaceId ||
            (m.assignedSpaceId == null && m.suggestedSpaceId === spaceId)
        );
      }
      return messages;
  }
}

export function formatInboxReceivedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
