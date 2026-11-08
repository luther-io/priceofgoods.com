export interface Good {
  name: string;
  dataKey: string;
  icon: string;
  unit: string;
  bgColor: string;
  lineColor: string;
  seriesId: Record<string, string>;
}

export interface Category {
  name: string;
  items: Record<string, Good>;
}

export interface GoodsConfig {
  categories: Record<string, Category>;
}

export interface RegionalPrice {
  current: number;
  priceChange: number | null;
  percentChange: number | null;
  latestDate: string | null;
}

export interface HistoryEntry {
  date: string;
  [region: string]: string | number;
}

export interface ItemData {
  currentPrices: Record<string, RegionalPrice>;
  history: HistoryEntry[];
}

export interface Citation {
  url?: string;
  title?: string;
  text?: string;
}

export interface PriceAnalysis {
  data: string;
  citations: (string | Citation)[];
  timestamp: number;
  provider: string;
  model?: string;
  usage?: AnalysisUsage;
}

export interface AnalysisUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  web_search_requests: number;
}
