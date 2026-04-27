export const INCIDENT_TYPE_TAGS = [
  { value: "Climate/Environmental", label: "Climate/Environmental" },
  { value: "Court Order Violation", label: "Court Order Violation" },
  { value: "Litigation", label: "Litigation" },
  { value: "Death", label: "Death" },
  { value: "Deported", label: "Deportation" },
  { value: "3rd Country Deportation", label: "Third Country Deportation" },
  { value: "Detention Conditions", label: "Detention Conditions" },
  { value: "Detained", label: "Disappearance/Detention" },
  { value: "Injury/Illness/Medical", label: "Illness/Injury" },
  { value: "Officer Misconduct", label: "Officer Misconduct" },
  { value: "Policy", label: "Policy" },
  { value: "Analysis", label: "Analysis" },
  { value: "Officer Use Of Force", label: "Officer Use of Force" },
  { value: "Raid", label: "Raid" },
  { value: "Resistance", label: "Resistance" },
  { value: "Resources", label: "Resources" },
  { value: "State/Local Collusion", label: "State/Local Collusion" },
  { value: "Vigilante", label: "Vigilante/Impersonator/Bounty Hunter" },
] as const;

export const PERSON_IMPACTED_TAGS = [
  { value: "DACA", label: "DACA/Dreamer" },
  { value: "LGBTQ+", label: "LGBTQ+" },
  { value: "LPR", label: "LPR/Greencard" },
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
  { value: "Military", label: "Military" },
] as const;

export const ENFORCEMENT_SETTING_TAGS = [
  { value: "Court/USCIS/Immigration Office", label: "Court/USCIS/Immigration Office" },
  { value: "Airport", label: "Airport" },
  { value: "Workplace", label: "Workplace" },
  { value: "School", label: "School" },
  { value: "Church/Place of Worship", label: "Church/Place of Worship" },
  { value: "Hospital/Medical", label: "Hospital/Medical" },
  { value: "Home/Residence", label: "Home/Residence" },
  { value: "Criminal/Detainer", label: "Criminal/Detainer" },
  { value: "Vehicle/Traffic Stop", label: "Vehicle/Traffic Stop" },
  { value: "Public Space/Street", label: "Public Space/Street" },
] as const;

// Combined flat list for backwards compat (admin, queries, etc.)
export const INCIDENT_TAGS = [
  ...INCIDENT_TYPE_TAGS.map((t) => t.value),
  ...PERSON_IMPACTED_TAGS.map((t) => t.value),
  ...ENFORCEMENT_SETTING_TAGS.map((t) => t.value),
] as const;

export const SOURCE_TYPE_TAGS = [
  { value: "legal-court", label: "Legal / Court" },
  { value: "local-news", label: "Local News" },
  { value: "national-news", label: "National News" },
  { value: "international-news", label: "International News" },
  { value: "investigative-nonprofit", label: "Investigative / Nonprofit" },
  { value: "social-media", label: "Social Media" },
] as const;

export const SOURCE_TYPE_DOMAINS: Record<string, string[]> = {
  "social-media": [
    "instagram.com", "facebook.com", "tiktok.com", "twitter.com", "x.com",
    "youtube.com", "reddit.com", "threads.net",
  ],
  "national-news": [
    "nytimes.com", "washingtonpost.com", "apnews.com", "cnn.com", "nbcnews.com",
    "cbsnews.com", "reuters.com", "politico.com", "npr.org", "foxnews.com",
    "usatoday.com", "abcnews.go.com", "huffpost.com", "thehill.com", "axios.com",
    "msnbc.com", "nypost.com",
  ],
  "international-news": [
    "bbc.com", "bbc.co.uk", "theguardian.com", "aljazeera.com",
  ],
  "investigative-nonprofit": [
    "propublica.org", "aclu.org", "democracynow.org", "thedailybeast.com",
    "vice.com", "theintercept.com", "nilc.org", "immigrantdefenseproject.org",
  ],
  "legal-court": [
    "courtlistener.com", "law.cornell.edu", "uscourts.gov", "pacer.gov",
    "storage.courtlistener.com",
  ],
};

export const STATUS = {
  RAW: "RAW",
  PROCESSING: "PROCESSING",
  COMPLETE: "COMPLETE",
  FAILED: "FAILED",
} as const;

// Query-string keys that represent an active filter. When any of these are set
// and no explicit `feed` is chosen, the feed auto-switches from "incidents" to
// "all" so users see filtered results across every bucket.
export const FILTER_KEYS = [
  "q", "tag", "sourceType", "location", "country",
  "from", "to", "range", "n", "s", "e", "w",
] as const;

export const TIME_RANGES = [
  { value: "month", label: "Past Month" },
  { value: "3months", label: "Past 3 Months" },
  { value: "year", label: "Past Year" },
  { value: "all", label: "All Time" },
] as const;
