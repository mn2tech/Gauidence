import type { InboxSmartBucket } from "@/lib/inbox/mockMail";

export type InboxSpaceHint = {
  id: string;
  display_name: string;
  profile_type: string;
};

const BILL_SENDERS =
  /bge\.com|wssc|pepco|utility|invoice|billing|statement|paypal|venmo|stripe|intuit|quickbooks|comcast|verizon|att\.com|tmobile|geico|progressive|statefarm|capitalone|chase\.com|bankofamerica|wellsfargo|amex|americanexpress/i;

const SCHOOL_SENDERS =
  /montgomeryschoolsmd|mcps|parentvue|powerschool|schoology|canvas\.|edmodo|school\.|k12\.|\.edu$/i;

const WORK_HINTS =
  /invoice|proposal|contract|meeting|demo|client|llc|inc\.|corp/i;

function pickSpaceId(
  spaces: InboxSpaceHint[],
  prefer: (s: InboxSpaceHint) => boolean
): string | null {
  return spaces.find(prefer)?.id ?? null;
}

export function classifyInboxBucket(args: {
  fromEmail: string;
  fromName: string;
  subject: string;
}): InboxSmartBucket | null {
  const blob = `${args.fromEmail} ${args.fromName} ${args.subject}`;
  if (BILL_SENDERS.test(blob) || /\bbill\b|\bdue\b|\bamount due\b/i.test(args.subject)) {
    return "bills";
  }
  if (SCHOOL_SENDERS.test(blob) || /\bschool\b|\babsence\b|\bparent\b/i.test(blob)) {
    return "school";
  }
  if (WORK_HINTS.test(blob)) return "work";
  return null;
}

export function suggestSpaceForBucket(
  bucket: InboxSmartBucket | null,
  spaces: InboxSpaceHint[]
): string | null {
  if (bucket === "school") {
    return (
      pickSpaceId(
        spaces,
        (s) =>
          s.profile_type === "child" ||
          s.profile_type === "student" ||
          s.profile_type === "family" ||
          /mcps|school/i.test(s.display_name)
      ) ?? spaces[0]?.id ?? null
    );
  }
  if (bucket === "bills") {
    return (
      pickSpaceId(
        spaces,
        (s) => s.profile_type === "personal" || s.profile_type === "home"
      ) ?? spaces[0]?.id ?? null
    );
  }
  if (bucket === "work") {
    return (
      pickSpaceId(
        spaces,
        (s) =>
          s.profile_type === "business" ||
          s.profile_type === "nonprofit" ||
          s.profile_type === "client"
      ) ?? spaces[0]?.id ?? null
    );
  }
  return null;
}

export function needsAttentionFromLabels(labelIds: string[]): boolean {
  return (
    labelIds.includes("UNREAD") ||
    labelIds.includes("IMPORTANT") ||
    labelIds.includes("STARRED")
  );
}
