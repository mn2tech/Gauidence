import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canHaveLinkedEmployees,
  canHaveLinkedFamilyMembers,
  canHaveLinkedHobbies,
  canHaveLinkedHomes,
  canHaveLinkedVehicles,
  formatLinkedClientsForGideon,
  formatLinkedEmployeesForGideon,
  formatLinkedFamilyForGideon,
  formatLinkedHobbiesForGideon,
  formatLinkedVehiclesForGideon,
  type GuardianProfileType,
} from "@/lib/profiles/types";

/** Load linked employees, clients, family members, etc. for Gideon context. */
export async function loadLinkedOrgContext(
  supabase: SupabaseClient,
  userId: string,
  active: { id: string; display_name: string; profile_type: GuardianProfileType }
): Promise<string> {
  if (canHaveLinkedEmployees(active.profile_type)) {
    const [{ data: employees }, { data: clients }, { data: homes }] =
      await Promise.all([
        supabase
          .from("guardian_profiles")
          .select("display_name, job_title, department, description")
          .eq("owner_user_id", userId)
          .eq("parent_profile_id", active.id)
          .eq("profile_type", "employee")
          .order("display_name", { ascending: true }),
        supabase
          .from("guardian_profiles")
          .select("display_name, job_title, department, description")
          .eq("owner_user_id", userId)
          .eq("parent_profile_id", active.id)
          .eq("profile_type", "client")
          .order("display_name", { ascending: true }),
        canHaveLinkedHomes(active.profile_type)
          ? supabase
              .from("guardian_profiles")
              .select("display_name")
              .eq("owner_user_id", userId)
              .eq("parent_profile_id", active.id)
              .eq("profile_type", "home")
              .order("display_name", { ascending: true })
          : Promise.resolve({ data: [] as { display_name: string }[] }),
      ]);
    const parts = [
      formatLinkedEmployeesForGideon(active.display_name, employees ?? []),
      formatLinkedClientsForGideon(active.display_name, clients ?? []),
    ];
    if ((homes ?? []).length > 0) {
      parts.push(
        `Linked homes under this organization: ${(homes ?? [])
          .map((h) => h.display_name)
          .join(", ")}`
      );
    }
    if (canHaveLinkedVehicles(active.profile_type)) {
      const { data: vehicles } = await supabase
        .from("guardian_profiles")
        .select("display_name, description")
        .eq("owner_user_id", userId)
        .eq("parent_profile_id", active.id)
        .eq("profile_type", "vehicle")
        .order("display_name", { ascending: true });
      if ((vehicles ?? []).length > 0) {
        parts.push(
          formatLinkedVehiclesForGideon(active.display_name, vehicles ?? [])
        );
      }
    }
    return parts.join("\n\n");
  }

  if (canHaveLinkedFamilyMembers(active.profile_type)) {
    const types = [
      "child",
      "spouse_partner",
      "parent",
      "family_member",
      "student",
      "pet",
      "vehicle",
      "hobby",
      ...(canHaveLinkedHomes(active.profile_type) ? (["home"] as const) : []),
    ];
    const { data: members } = await supabase
      .from("guardian_profiles")
      .select("display_name, profile_type, relationship, description")
      .eq("owner_user_id", userId)
      .eq("parent_profile_id", active.id)
      .in("profile_type", types)
      .order("display_name", { ascending: true });
    const people = (members ?? []).filter(
      (m) =>
        m.profile_type !== "home" &&
        m.profile_type !== "pet" &&
        m.profile_type !== "vehicle" &&
        m.profile_type !== "hobby" &&
        m.profile_type !== "student"
    );
    const students = (members ?? []).filter((m) => m.profile_type === "student");
    const pets = (members ?? []).filter((m) => m.profile_type === "pet");
    const hobbies = (members ?? []).filter((m) => m.profile_type === "hobby");
    const homes = (members ?? []).filter((m) => m.profile_type === "home");
    const vehicles = (members ?? []).filter((m) => m.profile_type === "vehicle");
    const parts = [formatLinkedFamilyForGideon(active.display_name, people)];
    if (students.length > 0) {
      parts.push(
        `Linked student profiles under this family: ${students
          .map((s) => s.display_name)
          .join(", ")}`
      );
    }
    if (pets.length > 0) {
      parts.push(
        `Linked pets under this family: ${pets
          .map((p) => p.display_name)
          .join(", ")}`
      );
    }
    if (hobbies.length > 0) {
      parts.push(
        formatLinkedHobbiesForGideon(
          active.display_name,
          hobbies.map((h) => ({
            display_name: h.display_name,
            description: h.description ?? null,
          }))
        )
      );
    }
    if (homes.length > 0) {
      parts.push(
        `Linked homes under this family: ${homes
          .map((h) => h.display_name)
          .join(", ")}`
      );
    }
    if (vehicles.length > 0) {
      parts.push(
        formatLinkedVehiclesForGideon(
          active.display_name,
          vehicles.map((v) => ({
            display_name: v.display_name,
            description: v.description ?? null,
          }))
        )
      );
    }
    return parts.join("\n\n");
  }

  if (
    canHaveLinkedHobbies(active.profile_type) &&
    active.profile_type !== "family"
  ) {
    const { data: hobbies } = await supabase
      .from("guardian_profiles")
      .select("display_name, description")
      .eq("owner_user_id", userId)
      .eq("parent_profile_id", active.id)
      .eq("profile_type", "hobby")
      .order("display_name", { ascending: true });
    if ((hobbies ?? []).length === 0) return "";
    return formatLinkedHobbiesForGideon(active.display_name, hobbies ?? []);
  }

  if (active.profile_type === "vehicles") {
    const { data: vehicles } = await supabase
      .from("guardian_profiles")
      .select("display_name, description")
      .eq("owner_user_id", userId)
      .eq("parent_profile_id", active.id)
      .eq("profile_type", "vehicle")
      .order("display_name", { ascending: true });
    return formatLinkedVehiclesForGideon(active.display_name, vehicles ?? []);
  }

  return "";
}
