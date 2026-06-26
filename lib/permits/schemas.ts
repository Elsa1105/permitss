import { z } from "zod";
import { HAZARD_TYPES } from "./hazards";

const HAZARD_VALUES = HAZARD_TYPES.map((h) => h.value) as [string, ...string[]];

export const NewPermitSchema = z
  .object({
    company_id: z.string().uuid("Company is required"),
    site_id: z.string().uuid("Site is required"),
    vessel_project: z.string().min(1, "Vessel / project is required"),
    location_of_work: z.string().min(1, "Location of work is required"),
    description: z.string().min(10, "Description must be at least 10 characters"),
    date_commencement: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    date_completion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    hazard_types: z.array(z.enum(HAZARD_VALUES)).min(1, "Select at least one hazard"),
    contractor: z.string().min(1, "Contractor is required"),

    contractor_company: z.string().optional().default(""),
    contractor_supervisor_name: z.string().optional().default(""),
    contractor_supervisor_registration_no: z.string().optional().default(""),
    worker_briefing_acknowledged: z.boolean().optional().default(false),
    top_controls_summary: z.string().optional().default(""),
  })
  .refine((v) => v.date_completion >= v.date_commencement, {
    message: "Completion date must be on or after commencement",
    path: ["date_completion"],
  })
  .refine((v) => v.date_commencement >= new Date().toISOString().slice(0, 10), {
    message: "Commencement cannot be before today",
    path: ["date_commencement"],
  });

export type NewPermitInput = z.infer<typeof NewPermitSchema>;

export const Stage1Schema = z.object({
  check_ventilation: z.literal(true, {
    errorMap: () => ({ message: "Required" }),
  }),
  check_display: z.literal(true, {
    errorMap: () => ({ message: "Required" }),
  }),
  check_watchman: z.literal(true, {
    errorMap: () => ({ message: "Required" }),
  }),
});

export type Stage1Input = z.infer<typeof Stage1Schema>;

export const Stage2ChecklistSchema = z.object({
  isolation_checked: z.boolean().optional().default(false),
  barricade_installed: z.boolean().optional().default(false),
  gas_test_completed: z.boolean().optional().default(false),
  fire_watch_assigned: z.boolean().optional().default(false),
  ppe_verified: z.boolean().optional().default(false),
  evidence_reviewed: z.boolean().optional().default(false),
});

export const Stage2Schema = z
  .object({
    fit: z.boolean(),
    remarks: z.string().optional().default(""),
    checklist: Stage2ChecklistSchema.optional().default({}),
  })
  .refine((v) => v.fit || v.remarks.trim().length > 0, {
    message: "Remarks are required when marking not fit",
    path: ["remarks"],
  })
  .refine(
    (v) => {
      if (!v.fit) return true;

      return (
        v.checklist.isolation_checked === true &&
        v.checklist.barricade_installed === true &&
        v.checklist.gas_test_completed === true &&
        v.checklist.fire_watch_assigned === true &&
        v.checklist.ppe_verified === true &&
        v.checklist.evidence_reviewed === true
      );
    },
    {
      message:
        "All condition-verification checklist items must be completed before marking fit",
      path: ["checklist"],
    },
  );

export type Stage2Input = z.infer<typeof Stage2Schema>;

export const Stage3Schema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    reason: z.string().optional().default(""),
  })
  .refine((v) => v.decision === "approve" || v.reason.trim().length > 0, {
    message: "Reason is required when rejecting",
    path: ["reason"],
  });

export type Stage3Input = z.infer<typeof Stage3Schema>;

export const EndorsementSchema = z
  .object({
    day_number: z.number().int().min(2).max(14),
    action: z.enum(["continue", "reject", "revoke"]),
    remarks: z.string().optional().default(""),
  })
  .refine((v) => v.action === "continue" || v.remarks.trim().length > 0, {
    message: "Remarks are required for reject/revoke",
    path: ["remarks"],
  });

export type EndorsementInput = z.infer<typeof EndorsementSchema>;