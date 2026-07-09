import { z } from "zod";
import { HAZARD_TYPES } from "./hazards";

const HAZARD_VALUES = HAZARD_TYPES.map((h) => h.value) as [
  string,
  ...string[],
];

const MAX_PERMIT_DAYS = 14;

function inclusiveDays(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 0;
  }

  return (
    Math.floor(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1
  );
}

export const NewPermitSchema = z
  .object({
    company_id: z.string().uuid("Company is required"),
    site_id: z.string().uuid("Site is required"),

    display_applicant_name: z
      .string()
      .trim()
      .min(1, "Applicant name is required")
      .optional()
      .default(""),

    // Department auto-filled from user profile if available.
    // It must NOT block permit submission when empty.
    display_applicant_department: z.string().optional().default(""),

    vessel_project: z.string().trim().min(1, "Vessel / project is required"),
    location_of_work: z.string().trim().min(1, "Location of work is required"),
    description: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters"),

    date_commencement: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),

    date_completion: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),

    hazard_types: z
      .array(z.enum(HAZARD_VALUES))
      .min(1, "Select at least one hazard"),

    other_hazard_text: z.string().optional().default(""),

    // Contractor is only mandatory for guest/contractor users.
    // The API route does the role-based required check.
    contractor: z.string().optional().default(""),

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
  })
  .refine(
    (v) =>
      inclusiveDays(v.date_commencement, v.date_completion) <= MAX_PERMIT_DAYS,
    {
      message:
        "Hot Work Permit validity cannot exceed 14 days for Day 2–14 endorsement flow",
      path: ["date_completion"],
    },
  )
  .refine(
    (v) =>
      !v.hazard_types.includes("other") ||
      v.other_hazard_text.trim().length > 0,
    {
      message: "Please specify the other hazard",
      path: ["other_hazard_text"],
    },
  );

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

export const Stage2ChecklistBooleanSchema = z.object({
  isolation_checked: z.boolean().optional().default(false),
  barricade_installed: z.boolean().optional().default(false),
  gas_test_completed: z.boolean().optional().default(false),
  fire_watch_assigned: z.boolean().optional().default(false),
  ppe_verified: z.boolean().optional().default(false),
  evidence_reviewed: z.boolean().optional().default(false),
});

export const Stage2ChecklistStatusValueSchema = z.enum(["yes", "no", "na"]);

export const Stage2ChecklistStatusSchema = z.object({
  isolation_checked: Stage2ChecklistStatusValueSchema,
  barricade_installed: Stage2ChecklistStatusValueSchema,
  gas_test_completed: Stage2ChecklistStatusValueSchema,
  fire_watch_assigned: Stage2ChecklistStatusValueSchema,
  ppe_verified: Stage2ChecklistStatusValueSchema,
  evidence_reviewed: Stage2ChecklistStatusValueSchema,
});

export const Stage2Schema = z
  .object({
    fit: z.boolean(),
    remarks: z.string().optional().default(""),

    // Backward-compatible boolean checklist.
    checklist: Stage2ChecklistBooleanSchema.optional().default({}),

    // New checklist: Yes / No / N/A.
    checklist_status: Stage2ChecklistStatusSchema.optional(),
  })
  .refine((v) => v.fit || v.remarks.trim().length > 0, {
    message: "Remarks are required when marking not fit",
    path: ["remarks"],
  })
  .refine(
    (v) => {
      if (!v.fit) return true;

      if (v.checklist_status) {
        return Object.values(v.checklist_status).every(
          (status) => status === "yes" || status === "na",
        );
      }

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
        "All condition-verification checklist items must be Yes or N/A before marking fit",
      path: ["checklist"],
    },
  )
  .refine(
    (v) => {
      if (!v.fit || !v.checklist_status) return true;

      const hasNa = Object.values(v.checklist_status).some(
        (status) => status === "na",
      );

      return !hasNa || v.remarks.trim().length > 0;
    },
    {
      message: "Remarks are required when any checklist item is marked N/A",
      path: ["remarks"],
    },
  )
  .refine(
    (v) => {
      if (!v.fit || !v.checklist_status) return true;

      return !Object.values(v.checklist_status).some(
        (status) => status === "no",
      );
    },
    {
      message:
        "Permit cannot be marked fit while any checklist item is marked No",
      path: ["checklist_status"],
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