export const INCIDENT_TYPE_TAGS = [
  { value: "Climate/Environmental", label: "Climate/Environmental" },
  { value: "Court Process Issue", label: "Court Process Issue" },
  { value: "Death", label: "Death" },
  { value: "Deported", label: "Deportation" },
  { value: "3rd Country Deportation", label: "Third Country Deportation" },
  { value: "Detention Conditions", label: "Detention Conditions" },
  { value: "Detained", label: "Disappearance/Detention" },
  { value: "Injury/Illness/Medical", label: "Injury/Illness/Medical" },
  { value: "Officer Misconduct", label: "Officer Misconduct" },
  { value: "Officer Use Of Force", label: "Officer Use of Force" },
  { value: "Protest / Intervention", label: "Protest/Intervention" },
  { value: "Raid", label: "Raid" },
  { value: "Vigilante", label: "Vigilante/Bounty Hunter Action" },
] as const;

export const PERSON_IMPACTED_TAGS = [
  { value: "DACA", label: "DACA/Dreamer" },
  { value: "LGBTQ+", label: "LGBTQ+" },
  { value: "LPR", label: "LPR/Greencard Holder" },
  { value: "Minor/Family", label: "Minor/Family" },
  { value: "Native American", label: "Native American" },
  { value: "Person with Disability", label: "Person with Disability" },
  { value: "Refugee/Asylum", label: "Refugee/Asylum Seeker" },
  { value: "Student", label: "Student" },
  { value: "TPS", label: "Temporary Protected Status" },
  { value: "U.S. Citizen", label: "U.S. Citizen" },
  { value: "Visa / Legal Status", label: "Visa/Legal Status" },
] as const;

// Combined flat list for backwards compat (admin, queries, etc.)
export const INCIDENT_TAGS = [
  ...INCIDENT_TYPE_TAGS.map((t) => t.value),
  ...PERSON_IMPACTED_TAGS.map((t) => t.value),
] as const;

export const STATUS = {
  RAW: "RAW",
  PROCESSING: "PROCESSING",
  COMPLETE: "COMPLETE",
  FAILED: "FAILED",
} as const;

export const TIME_RANGES = [
  { value: "month", label: "Past Month" },
  { value: "3months", label: "Past 3 Months" },
  { value: "year", label: "Past Year" },
  { value: "all", label: "All Time" },
] as const;
