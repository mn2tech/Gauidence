import { z } from "zod";
import {
  PAYROLL_ACCESS_TYPES,
  PAYROLL_EXPORT_FORMATS,
} from "./types";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const generateReportSchema = z.object({
  profileId: z.string().uuid(),
  payPeriodStart: isoDate,
  payPeriodEnd: isoDate,
});

export const approveReportSchema = z.object({
  reportId: z.string().uuid(),
});

export const updateEntrySchema = z.object({
  entryId: z.string().uuid(),
  adjustmentHours: z.number().min(-999).max(999).optional(),
  adjustmentReason: z.string().max(500).nullable().optional(),
  ownerNotes: z.string().max(1000).nullable().optional(),
});

export const createShareSchema = z.object({
  reportId: z.string().uuid(),
  recipientEmail: z.string().email(),
  recipientName: z.string().max(200).optional(),
  accessType: z.enum(PAYROLL_ACCESS_TYPES),
  allowedFormats: z.array(z.enum(PAYROLL_EXPORT_FORMATS)).min(1),
  expiresAt: z.string().datetime(),
  requireEmailVerification: z.boolean().default(true),
  optionalMessage: z.string().max(2000).optional(),
  replaceExisting: z.boolean().optional(),
});

export const verifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export const timeEntrySchema = z.object({
  profileId: z.string().uuid(),
  employeeProfileId: z.string().uuid(),
  clockInAt: z.string().datetime(),
  clockOutAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(500).optional(),
});

export const manualTimeEntrySchema = z.object({
  profileId: z.string().uuid(),
  employeeProfileId: z.string().uuid(),
  workDate: isoDate,
  hours: z.number().min(0.25).max(24),
  notes: z.string().max(500).optional(),
});

export function parsePayPeriodDates(start: string, end: string): { ok: true } | { ok: false; error: string } {
  if (end < start) {
    return { ok: false, error: "Pay period end must be on or after the start date." };
  }
  return { ok: true };
}
