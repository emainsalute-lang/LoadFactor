import { z } from "zod";
import { catalogSchema, templatesSchema } from "./workspace";
export const timezoneSchema = z.string().max(100).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Choose a valid IANA timezone, such as Africa/Tripoli.");
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(12, "Use at least 12 characters for your password.").max(128);
export const profileSchema = z.object({
  role: z.enum(["athlete", "coach"]).default("athlete"),
  bodyweightKg: z.number().finite().min(1).max(500).nullable().optional(),
  name: z.string().trim().min(1).max(80), sport: z.string().trim().min(1).max(80),
  timezone: timezoneSchema, weightUnit: z.enum(["kg", "lbs"]), heightUnit: z.enum(["cm", "in"]),
});
export const registerSchema = profileSchema.extend({ email: emailSchema, password: passwordSchema });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const recoverySchema = z.object({ email: emailSchema, recoveryCode: z.string().trim().min(1).max(100), password: passwordSchema });
export const assetsSchema = z.object({ custom: catalogSchema, templates: templatesSchema });
