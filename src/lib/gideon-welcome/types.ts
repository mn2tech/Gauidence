import type { GuardianProfileType } from "@/lib/profiles/types";
import type { SimpleHomeProfileCategory } from "@/lib/simple-home/helpers";

export type GideonWelcomeStatusItem = {
  id: string;
  text: string;
};

export type GideonWelcomeAction = {
  id: string;
  label: string;
  href?: string;
  /** Prefilled Ask Gideon question (navigates to /ask?draft=…). */
  question?: string;
};

export type GideonWelcomeSpaceStats = {
  category: SimpleHomeProfileCategory;
  profileType: GuardianProfileType | null;
  leadsNeedFollowUp: number;
  proposalsAwaitingResponse: number;
  recentItemsCount: number;
  upcomingAlertsCount: number;
  openRequestCount: number;
  hasAnyData: boolean;
};

export type GideonWelcomeViewModel = {
  greetName: string | null;
  spaceName: string | null;
  isNewUser: boolean;
  isEmptySpace: boolean;
  statusItems: GideonWelcomeStatusItem[];
  actions: GideonWelcomeAction[];
  statusUnavailable: boolean;
};
