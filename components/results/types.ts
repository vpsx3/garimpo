import type { Anchor, Row } from "@/lib/filters/apply";

export type { Anchor, Row };

export type EmptyDiagnosis = {
  base: number;
  perFilter: { key: string; label: string; survivors: number }[];
  culprits: { key: string; label: string }[];
};

export type SearchResponse = {
  rows: Row[];
  provider: string;
  fellBackTo: string | null;
};

export type Verdict = "shortlist" | "rejected" | "seen" | null;
