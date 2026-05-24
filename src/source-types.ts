export type SourceAdapter = "rss" | "ticker_rss" | "search_rss" | "html_static" | "browser_dynamic" | "x_browser";
export type SourceTier = "fast" | "normal" | "slow";
export type SourceCategory = "official" | "news" | "social" | "policy" | "industry" | "search";

export interface HtmlSelectors {
  item?: string;
  title?: string;
  link?: string;
  summary?: string;
  date?: string;
}

export interface BrowserFallbackConfig {
  enabled?: boolean;
  url?: string;
  urls?: string[];
  onEmpty?: boolean;
  headless?: boolean;
  profileDir?: string;
  waitMs?: number;
  maxItems?: number;
  selectors?: HtmlSelectors;
}

export interface SourceDefinition {
  id: string;
  name: string;
  enabled: boolean;
  adapter: SourceAdapter;
  tier: SourceTier;
  category: SourceCategory;
  cadenceMinutes: number;
  url?: string;
  urls?: string[];
  urlTemplate?: string;
  queries?: string[];
  accounts?: string[];
  perTicker?: boolean;
  maxQueries?: number;
  maxItems?: number;
  maxItemsPerAccount?: number;
  lookbackHours?: number;
  throttleMs?: number;
  waitMs?: number;
  profileDir?: string;
  headless?: boolean;
  useGeneratedWatchlist?: boolean;
  selectors?: HtmlSelectors;
  browserFallback?: BrowserFallbackConfig;
  sourceKind?: "rss" | "social" | "crawler" | "search";
  userAgent?: string;
  notes?: string;
}

export interface SourceRegistry {
  version: number;
  sources: SourceDefinition[];
}

export interface SourceSchedulerState {
  lastRunMsBySourceId: Record<string, number>;
}
