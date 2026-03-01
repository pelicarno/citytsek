export interface Property {
  parcelid: string;
  description: string;
  category: string;
  address: string;
  erfExtent: number;
  marketValue: number;
  dwellingExtent?: number;
}

export interface SaleRow {
  ref: string;
  address: string;
  description: string;
  erfExtent: string;
  dwellingExtent: string;
  saleDate: string;
  salePrice: string;
}

export interface ParsedSale {
  ref: string;
  address: string;
  description: string;
  erfExtent: number;
  dwellingExtent: number;
  saleDate: string;
  salePrice: number;
}

export interface EnrichedSale extends ParsedSale {
  date: string; // ISO string (Date not serializable)
  pricePerM2Dwelling: number;
  pricePerM2Erf: number;
  fracYear: number;
  tenure: string;
}

export interface PolyModel {
  coeffs: number[];
  xMean: number;
  xStd: number;
}

export interface IQRFences {
  q1: number;
  q3: number;
  iqr: number;
  lower: number;
  upper: number;
}

export interface Prediction {
  label: string;
  dateISO: string;
  fracYear: number;
  predictedPricePerM2: number;
  theoreticalValueDwelling: number;
  diffFromGV: number;
  pctFromGV: number;
}

export interface Filters {
  minPrice: number;
  erfRange: [number, number];
  dwellingRange: [number, number];
  freeholdOnly: boolean;
  iqr: number;
}

/**
 * Median-based valuation — the PRIMARY method for the overvalued/undervalued verdict.
 *
 * Uses the "sales comparison approach" which is the standard method in South African
 * property valuation practice: compare the subject property's R/m² to the distribution
 * of actual comparable sales.
 *
 * WHY THIS IS PRIMARY OVER POLYNOMIAL REGRESSION:
 * - Polynomial regression of R/m² vs time typically yields R² of 0.05–0.15 for
 *   residential property, meaning it explains <15% of price variance. This is because
 *   property prices depend on many factors (condition, renovations, views, aspect)
 *   that are not captured by dwelling size and date alone.
 * - A point estimate from such a weak model has wide uncertainty and is easy for
 *   a municipal assessor to dismiss.
 * - The median of comparable sales is model-free, transparent, and standard practice
 *   that valuation tribunals expect.
 * - The time-weighted variant handles the staleness of older sales without needing
 *   a time-series model.
 *
 * The polynomial regression is kept as SUPPLEMENTARY analysis — useful for
 * visualising the market trend on the chart, but not the basis of the verdict.
 */
export interface MedianValuation {
  /** Simple median R/m² dwelling of all filtered comparable sales */
  medianPricePerM2: number;
  /**
   * Time-weighted median R/m² — gives exponentially more weight to recent sales.
   * Uses half-life of 2 years from the GV2025 valuation date (1 July 2025).
   * A sale from 2 years before valuation gets weight 0.5, 4 years gets 0.25, etc.
   * More reliable than simple median when sales span many years.
   */
  timeWeightedMedianPricePerM2: number;
  /** IQR Q1 of R/m² dwelling — lower bound of the "fair value" range */
  q1PricePerM2: number;
  /** IQR Q3 of R/m² dwelling — upper bound of the "fair value" range */
  q3PricePerM2: number;
  /** medianPricePerM2 × dwelling extent — the primary market estimate */
  medianValue: number;
  /** timeWeightedMedianPricePerM2 × dwelling extent */
  timeWeightedValue: number;
  /** q1 × dwelling extent — lower bound of fair value range */
  q1Value: number;
  /** q3 × dwelling extent — upper bound of fair value range */
  q3Value: number;
  /**
   * Verdict based on where GV2025 R/m² falls in the comparable distribution:
   * - "overvalued": GV2025 R/m² > Q3 (above 75th percentile)
   * - "fair": Q1 ≤ GV2025 R/m² ≤ Q3 (within middle 50%)
   * - "undervalued": GV2025 R/m² < Q1 (below 25th percentile)
   */
  verdict: "overvalued" | "fair" | "undervalued";
  /** How far GV2025 value is from median, as a percentage of median */
  pctFromMedian: number;
}

export interface AnalysisResult {
  filterLog: string[];
  stats: {
    count: number;
    dateRange: [string, string];
    avgPrice: number;
    medianPrice: number;
    minPrice: number;
    maxPrice: number;
  };
  fences: IQRFences;
  enrichedSales: EnrichedSale[];
  /** Median-based valuation — PRIMARY method for verdict (see MedianValuation JSDoc) */
  medianValuation: MedianValuation;
  /** Polynomial regression model — SUPPLEMENTARY, used for trend chart only */
  model: PolyModel;
  /** R² of the polynomial model. Typically 0.05–0.15 for residential property. */
  r2: number;
  predictions: Prediction[];
  reportText: string;
  filters: Filters;
}

export interface LookupResponse {
  property: Property;
  salesRows: SaleRow[];
  detectedDwelling: number | null;
}

export interface AnalyzeRequest {
  property: Property & { dwellingExtent: number };
  salesRows: SaleRow[];
  dwellingExtent: number;
  filters?: Partial<Filters>;
}
