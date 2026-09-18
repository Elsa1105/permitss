export const HAZARD_TYPES = [
  {
    value: "fire",
    label: "Fire",
  },
  {
    value: "burns_from_flame",
    label: "Burns from flame",
  },
  {
    value: "burns_from_hot_surface_contact",
    label: "Burns from hot surface contact",
  },
  {
    value: "burns_from_radiation_heat",
    label: "Burns from radiation / heat exposure",
  },
  {
    value: "toxic_fumes_smoke_inhalation",
    label: "Toxic fumes / smoke inhalation",
  },
  {
    value: "electrocution_from_welding",
    label: "Electrocution from welding equipment",
  },
  {
    value: "explosion_risk",
    label: "Explosion risk",
  },
  {
    value: "eye_injury_sparks_arc_flash",
    label: "Eye injury from sparks / arc flash",
  },
  {
    value: "gas_exposure",
    label: "Gas exposure",
  },
  {
    value: "other",
    label: "Other",
  },
] as const;

export type HazardType = (typeof HAZARD_TYPES)[number]["value"];

export function hazardLabel(value: string) {
  return (
    HAZARD_TYPES.find((hazard) => hazard.value === value)?.label ??
    value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())
  );
}