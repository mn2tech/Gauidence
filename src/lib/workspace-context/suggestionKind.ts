import type { GuardianProfileType } from "@/lib/profiles/types";
import type { SuggestionProfileKind } from "@/lib/vault/gideon";

/** Map a guardian profile type to Gideon's suggestion/vault personality kind. */
export function suggestionKindFrom(
  type: GuardianProfileType
): SuggestionProfileKind {
  if (type === "child" || type === "student") return type;
  if (type === "teacher") return type;
  if (
    type === "business" ||
    type === "non_profit" ||
    type === "employee" ||
    type === "client"
  ) {
    return type === "non_profit" ? "non_profit" : type;
  }
  if (
    type === "vehicle" ||
    type === "home" ||
    type === "pet" ||
    type === "hobby" ||
    type === "event"
  ) {
    return type;
  }
  if (
    type === "spouse_partner" ||
    type === "parent" ||
    type === "family_member"
  ) {
    return "family";
  }
  if (type === "family" || type === "vehicles") {
    return type === "family" ? "family" : "other";
  }
  if (type === "personal") return "personal";
  return "other";
}
