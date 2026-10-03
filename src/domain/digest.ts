export interface DigestItem {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  freshness: "24h" | "72h" | "7d";
  category: string;
  summary: string;
  whyItMatters: string;
  angle: string;
  caveat: string;
  evidence: Array<{ url: string; quote: string }>;
  recommended: boolean;
}

export interface DailyDigest {
  date: string;
  generatedAt: string;
  windowStart: string;
  title: string;
  intro: string;
  coverageNotes: string[];
  items: DigestItem[];
}

export interface DigestSelection {
  date: string;
  selectedIds: string[];
  angle: string;
  updatedAt: string | null;
}

export interface DigestIndexItem {
  date: string;
  title: string;
  count: number;
  generatedAt: string;
}
