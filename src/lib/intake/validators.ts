import { z } from "zod";

export const createIntakeRequestSchema = z.object({
  employeeProfileId: z.string().uuid(),
  recipientEmail: z.string().email().max(320),
  recipientName: z.string().max(200).optional(),
  purpose: z.enum(["ssn_clearance", "w9", "onboarding"]).default("ssn_clearance"),
  optionalMessage: z.string().max(2000).optional(),
  requireEmailVerification: z.boolean().default(true),
  sendEmail: z.boolean().default(true),
});

export const submitIntakeSsnSchema = z.object({
  ssn: z.string().min(9).max(20).optional(),
});

export const verifyIntakeCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
});
