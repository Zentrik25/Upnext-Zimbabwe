/** Shapes of the jobseeker endpoints (docs/engineering/openapi/openapi.yaml, Phase 6B). */
import type { Category, OpportunitySummary, Page } from "./catalog-types";

export type Named = { id: string; slug: string; name: string };
export type Qualification =
  | "o_level"
  | "a_level"
  | "certificate"
  | "diploma"
  | "bachelors_degree"
  | "honours_degree"
  | "masters_degree"
  | "doctorate"
  | "professional_qualification";

export type SeekerProfile = {
  exists: boolean;
  home_location: Named | null;
  highest_qualification: Qualification | null;
  experience_level: string | null;
  work_arrangements: string[];
  employment_types: string[];
  categories: Category[];
  sectors: Named[];
  preferred_locations: Named[];
  skills: { id: string; name: string }[];
  fields_filled: number;
  fields_total: number;
  updated_at: string | null;
};

export type Note = { signal: string; text: string };
export type ForYouRow = {
  opportunity: OpportunitySummary;
  match: { reasons: Note[]; unknowns: Note[]; notes: Note[] };
};
export type ForYouFeed = {
  data: ForYouRow[];
  page: Page;
  meta: {
    model_version: string;
    mode: "matched" | "newest";
    fields_filled: number;
    fields_total: number;
    suggestions: Note[];
  };
};

export type JobAlert = {
  enabled: boolean;
  frequency: "daily" | "weekly";
  categories: Category[];
  locations: Named[];
  consented_at: string | null;
  consent_wording_version: string;
  last_sent_at: string | null;
  delivery_available: boolean;
  consent_wording: string;
  updated_at: string | null;
};

export const QUALIFICATIONS: { value: Qualification; label: string }[] = [
  { value: "o_level", label: "O Level" },
  { value: "a_level", label: "A Level" },
  { value: "certificate", label: "Certificate" },
  { value: "diploma", label: "Diploma" },
  { value: "bachelors_degree", label: "Bachelor's degree" },
  { value: "honours_degree", label: "Honours degree" },
  { value: "masters_degree", label: "Master's degree" },
  { value: "doctorate", label: "Doctorate" },
  { value: "professional_qualification", label: "Professional qualification" },
];

export const EXPERIENCE_LEVELS: { value: string; label: string }[] = [
  { value: "none", label: "No experience yet" },
  { value: "entry", label: "Entry level" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior level" },
  { value: "executive", label: "Executive" },
];

export const EMPLOYMENT_TYPES: { value: string; label: string }[] = [
  { value: "full_time", label: "Full time" },
  { value: "permanent", label: "Permanent" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "part_time", label: "Part time" },
  { value: "internship", label: "Internship" },
  { value: "trainee", label: "Trainee" },
];

export const WORK_ARRANGEMENTS: { value: string; label: string }[] = [
  { value: "on_site", label: "On site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];
