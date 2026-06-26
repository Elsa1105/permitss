// Hazard types per PRD §3.1
export const HAZARD_TYPES = [
  { value: "welding",  label: "Welding"  },
  { value: "cutting",  label: "Cutting"  },
  { value: "brazing",  label: "Brazing"  },
  { value: "heating",  label: "Heating"  },
  { value: "riveting", label: "Riveting" },
  { value: "other",    label: "Other"    },
] as const;

export type HazardType = (typeof HAZARD_TYPES)[number]["value"];
