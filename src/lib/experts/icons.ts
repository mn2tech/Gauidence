import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Brain,
  Briefcase,
  Cloud,
  Database,
  GraduationCap,
  MessageCircle,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  "book-open": BookOpen,
  "message-circle": MessageCircle,
  brain: Brain,
  database: Database,
  cloud: Cloud,
  briefcase: Briefcase,
  users: Users,
  "graduation-cap": GraduationCap,
  target: Target,
};

export function resolveExpertIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Sparkles;
}

export function expertAccentClass(accent: string): string {
  switch (accent) {
    case "purple":
      return "text-purple-600 bg-purple-50 border-purple-200";
    case "blue":
      return "text-blue-600 bg-blue-50 border-blue-200";
    case "green":
      return "text-emerald-600 bg-emerald-50 border-emerald-200";
    case "orange":
      return "text-orange-600 bg-orange-50 border-orange-200";
    default:
      return "text-brand bg-brand-light border-brand/20";
  }
}

export function expertStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "beta":
      return "Beta";
    case "development":
      return "Development";
    case "coming-soon":
      return "Coming soon";
    case "unavailable":
      return "Unavailable";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}

export function expertStatusClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700";
    case "beta":
      return "bg-sky-50 text-sky-700";
    case "development":
      return "bg-amber-50 text-amber-700";
    case "coming-soon":
      return "bg-stone-100 text-ink-muted";
    case "unavailable":
      return "bg-red-50 text-red-700";
    case "archived":
      return "bg-stone-100 text-ink-muted";
    default:
      return "bg-stone-100 text-ink-muted";
  }
}

export const EXPERT_CATEGORIES = [
  "All",
  "Professional",
  "Learning",
  "Business",
  "Personal",
] as const;
