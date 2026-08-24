import {
  PERSONAL_SPACE_ACTIONS,
  PERSONAL_SPACE_DISPLAY_NAME,
  PERSONAL_SPACE_WELCOME,
} from "./types";

export type PersonalSpaceWelcomeModel = {
  title: string;
  body: string;
  spaceName: string;
  showWelcome: boolean;
  actions: typeof PERSONAL_SPACE_ACTIONS;
  /** True when user should not see create-space form. */
  skipCreateSpaceForm: boolean;
};

/**
 * First-login welcome for Personal Space.
 * No complicated wizard — three actions and immediate Gideon access.
 */
export function buildPersonalSpaceWelcome(options: {
  hasPersonalSpace: boolean;
  isEmptySpace: boolean;
  isNewUser: boolean;
  spaceDisplayName?: string | null;
}): PersonalSpaceWelcomeModel {
  const showWelcome =
    options.hasPersonalSpace &&
    (options.isNewUser || options.isEmptySpace);

  return {
    title: PERSONAL_SPACE_WELCOME.title,
    body: PERSONAL_SPACE_WELCOME.body,
    spaceName:
      options.spaceDisplayName?.trim() || PERSONAL_SPACE_DISPLAY_NAME,
    showWelcome,
    actions: PERSONAL_SPACE_ACTIONS,
    skipCreateSpaceForm: options.hasPersonalSpace,
  };
}

export function isPersonalSpaceProfile(profile: {
  profile_type?: string | null;
  is_default?: boolean | null;
  display_name?: string | null;
}): boolean {
  return profile.profile_type === "personal";
}
