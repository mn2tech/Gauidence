import { stripProposedReminderSection } from "@/lib/reminders/propose";
import { stripProposedDailyLogSection } from "@/lib/logs/propose";
import {
  stripProposedWorkMemoryUpdateSection,
} from "@/lib/work-memory/propose";
import { stripProposedClientRequestReplySection } from "@/lib/client-requests/propose";
import { stripProposedClientRequestCreateSection } from "@/lib/client-requests/proposeCreate";
import { stripProposedSpaceCreateSection } from "@/lib/profiles/proposeCreate";
import { stripFocusBlockSection } from "@/lib/gideon/focusBlock";
import { parseGideonSections } from "@/lib/vault/gideon";

function stripAssistantProposalSections(content: string): string {
  return stripFocusBlockSection(
    stripProposedDailyLogSection(
      stripProposedSpaceCreateSection(
        stripProposedClientRequestCreateSection(
          stripProposedClientRequestReplySection(
            stripProposedWorkMemoryUpdateSection(
              stripProposedReminderSection(content)
            )
          )
        )
      )
    )
  );
}

/** Plain text for copy / clipboard from a Gideon assistant message. */
export function formatAssistantMessagePlainText(content: string): string {
  const displayContent = stripAssistantProposalSections(content);
  const sections = parseGideonSections(displayContent || content);
  if (sections.length === 0) {
    return (displayContent || content).trim();
  }
  return sections
    .map((sec) => {
      const title = sec.title ? `${sec.title}\n` : "";
      return `${title}${sec.content}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Strip lightweight markdown before speech synthesis. */
export function formatAssistantMessageSpeechText(content: string): string {
  return formatAssistantMessagePlainText(content)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,4}\s+/gm, "");
}
