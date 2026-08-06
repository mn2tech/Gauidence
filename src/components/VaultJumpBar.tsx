"use client";

import { useMemo } from "react";
import {
  canHaveLinkedClients,
  canHaveLinkedEmployees,
  canHaveLinkedFamilyMembers,
  canHaveLinkedHobbies,
  canHaveLinkedHomes,
  canHaveLinkedPets,
  canHaveLinkedStudents,
  canHaveLinkedVehicles,
  type GuardianProfile,
} from "@/lib/profiles/types";
import { openVaultSection } from "@/components/VaultSection";

type JumpChip = {
  sectionId: string;
  label: string;
};

function buildChips(profile: GuardianProfile): JumpChip[] {
  const id = profile.id;
  const type = profile.profile_type;
  const chips: JumpChip[] = [
    { sectionId: `documents-${id}`, label: "Files" },
    { sectionId: `daily-log-${id}`, label: "Daily Log" },
    { sectionId: `attention-${id}`, label: "Alerts" },
  ];

  const peopleIds: string[] = [];
  if (canHaveLinkedEmployees(type)) peopleIds.push(`employees-${id}`);
  if (canHaveLinkedClients(type)) peopleIds.push(`clients-${id}`);
  if (canHaveLinkedFamilyMembers(type)) peopleIds.push(`family-${id}`);
  if (canHaveLinkedStudents(type)) peopleIds.push(`students-${id}`);
  if (canHaveLinkedPets(type)) peopleIds.push(`pets-${id}`);
  if (canHaveLinkedHobbies(type)) peopleIds.push(`hobbies-${id}`);
  if (canHaveLinkedHomes(type)) peopleIds.push(`homes-${id}`);
  if (canHaveLinkedVehicles(type)) peopleIds.push(`vehicles-${id}`);
  if (peopleIds.length > 0) {
    chips.push({ sectionId: peopleIds[0]!, label: "People" });
  }

  const workIds: string[] = [];
  if (canHaveLinkedEmployees(type)) {
    workIds.push(`leave-${id}`, `timesheets-${id}`);
  }
  if (type === "employee" && profile.parent_profile_id) {
    workIds.push(`my-hours-${id}`);
  }
  if (workIds.length > 0) {
    chips.push({ sectionId: workIds[0]!, label: "Work" });
  }

  return chips;
}

export default function VaultJumpBar({ profile }: { profile: GuardianProfile }) {
  const chips = useMemo(() => buildChips(profile), [profile]);

  return (
    <nav
      aria-label="Vault sections"
      className="sticky top-[6.75rem] z-20 -mx-4 flex gap-1.5 overflow-x-auto border-b border-stone-200 bg-background/95 px-4 py-2 backdrop-blur sm:top-[7.25rem] sm:mx-0 sm:rounded-xl sm:border sm:bg-white/95 sm:px-3"
    >
      {chips.map((chip) => (
        <button
          key={chip.sectionId}
          type="button"
          onClick={() => openVaultSection(chip.sectionId)}
          className="shrink-0 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-foreground transition hover:border-stone-400 hover:bg-stone-50"
        >
          {chip.label}
        </button>
      ))}
    </nav>
  );
}
