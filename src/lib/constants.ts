export const INCIDENT_TYPE_TAGS = [
  { value: "Climate/Environmental", label: "Climate/Environmental" },
  { value: "Court Process Issue", label: "Court Process Issue" },
  { value: "Death", label: "Death" },
  { value: "Deported", label: "Deportation" },
  { value: "3rd Country Deportation", label: "Third Country Deportation" },
  { value: "Detention Conditions", label: "Detention Conditions" },
  { value: "Detained", label: "Disappearance/Detention" },
  { value: "Injury/Illness/Medical", label: "Illness/Injury" },
  { value: "Officer Misconduct", label: "Officer Misconduct" },
  { value: "Officer Use Of Force", label: "Officer Use of Force" },
  { value: "Raid", label: "Raid" },
  { value: "State/Local Collusion", label: "State/Local Collusion" },
  { value: "Vigilante", label: "Vigilante/Impersonator/Bounty Hunter" },
] as const;

export const PERSON_IMPACTED_TAGS = [
  { value: "DACA", label: "DACA/Dreamer" },
  { value: "LGBTQ+", label: "LGBTQ+" },
  { value: "LPR", label: "LPR/Greencard Holder" },
  { value: "Minor/Family", label: "Minor" },
  { value: "Native American", label: "Native American (U.S.)" },
  { value: "Indigenous (Non-U.S.)", label: "Indigenous (Non-U.S.)" },
  { value: "Person with Disability", label: "Person with Disability" },
  { value: "Refugee/Asylum", label: "Refugee/Asylum Seeker" },
  { value: "Student", label: "Student" },
  { value: "TPS", label: "Temporary Protected Status" },
  { value: "U.S. Citizen", label: "U.S. Citizen" },
  { value: "Protester/Intervenor", label: "Protester/Intervenor" },
  { value: "Palestine Advocate", label: "Palestine Advocate" },
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
