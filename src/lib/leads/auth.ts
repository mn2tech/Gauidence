/** Reuses business profile auth from proposals — same business workspace scope. */
export {
  requireProposalUser as requireLeadUser,
  isProposalAuthed as isLeadAuthed,
  resolveBusinessProfile,
  requireEditableBusinessProfile,
  type ProposalAuthed as LeadAuthed,
} from "@/lib/proposals/auth";
