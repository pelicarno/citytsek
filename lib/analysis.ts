/**
 * Valuation analysis engine.
 *
 * ## Methodology overview (read this first)
 *
 * The goal is to determine whether the City of Cape Town's GV2025 valuation for a
 * residential property is fair relative to actual comparable sales in the area.
 *
 * Two methods are used:
 *
 * ### 1. Median-based valuation (PRIMARY — drives the overvalued/undervalued verdict)
 *
 * Standard "sales comparison approach" used in South African property valuation:
 * - Filter neighbourhood sales to genuine comparables (by size, price, tenure, IQR).
 * - Compute R/m² dwelling for each sale.
 * - The **median R/m²** × subject dwelling extent = market estimate.
 * - A **time-weighted median** (exponential decay, half-life 2 years) gives more
 *   weight to recent sales, handling price appreciation without a regression model.
 * - The **IQR range** (Q1–Q3) × dwelling extent = "fair value band".
 * - Verdict: overvalued if GV2025 R/m² > Q3, undervalued if < Q1, fair if within.
 *
 * Why primary: transparent, model-free, standard practice, hard to dismiss.
 *
 * ### 2. Polynomial regression (SUPPLEMENTARY — chart visualisation only)
 *
 * Degree-2 polynomial of R/m² dwelling vs. fractional year.
 * Useful for visualising the market trend over time, but R² is typically 0.05–0.15
 * for residential property because price depends on many unobserved factors
 * (condition, renovations, views, etc.). A point estimate from such a weak model
 * has wide uncertainty and should not be the sole basis for a verdict.
 *
 * The regression IS included in the report and chart — it provides useful context
 * about whether prices are trending up or down — but the verdict and "market
 * estimate" figures come from the median approach.
 */

import {
  SaleRow,
  ParsedSale,
  EnrichedSale,
  Property,
  Filters,
  PolyModel,
  IQRFences,
  Prediction,
  MedianValuation,
  AnalysisResult,
} from "./types";

const POLY_DEGREE = 2;

/** GV2025 valuation date — all time-weighting is anchored to this date. */
const VALUATION_DATE = new Date(2025, 6, 1);

/**
 * Half-life for time-weighted median, in years.
 * A sale from 2 years before valuation date gets weight 0.5.
 * 4 years → 0.25, 6 years → 0.125, etc.
 */
const TIME_WEIGHT_HALF_LIFE_YEARS = 2;

const TARGET_DATES = [
  { label: "1 July 2025 (GV2025 valuation date)", date: new Date(2025, 6, 1) },
  { label: "1 January 2026", date: new Date(2026, 0, 1) },
  { label: "1 July 2026 (New FY start)", date: new Date(2026, 6, 1) },
  { label: "1 January 2027 (Mid FY)", date: new Date(2027, 0, 1) },
  { label: "1 July 2027 (FY end)", date: new Date(2027, 6, 1) },
];

// ── Date utilities ──────────────────────────────────────────────────────────

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("/").map(Number);
  return new Date(y, m - 1, d);
}

function dateToFractionalYear(d: Date): number {
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  return year + (d.getTime() - start.getTime()) / (end.getTime() - start.getTime());
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${dd}`;
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function fmtR(n: number): string {
  return "R " + Math.round(n).toLocaleString("en-ZA");
}

function fmtNum(n: number, dec = 0): string {
  return n.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function padR(s: string, w: number): string {
  return String(s).padEnd(w);
}
function padL(s: string, w: number): string {
  return String(s).padStart(w);
}

function table(headers: string[], rows: string[][], aligns: string[]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length))
  );
  const pad = (val: string, i: number) =>
    aligns[i] === "R" ? padL(val, widths[i]) : padR(val, widths[i]);

  const sep = widths.map((w) => "─".repeat(w)).join("─┼─");
  const hdr = headers.map((h, i) => pad(h, i)).join(" │ ");
  const body = rows
    .map((r) => r.map((c, i) => pad(c, i)).join(" │ "))
    .join("\n");

  return `${hdr}\n${sep}\n${body}`;
}

// ── Filtering helpers ───────────────────────────────────────────────────────

function isSectionalTitle(description: string): boolean {
  return /^SS\d|^\d+.*-\d+/.test(description.trim());
}

function isFreehold(description: string): boolean {
  return !isSectionalTitle(description);
}

function computeIQRFences(values: number[], multiplier = 1.5): IQRFences {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  return { q1, q3, iqr, lower: q1 - multiplier * iqr, upper: q3 + multiplier * iqr };
}

function extractSuburb(address: string): string {
  const parts = address.trim().split(/\s+/);
  return parts.length > 0 ? parts[parts.length - 1] : "the area";
}

function autoRange(value: number, loMult = 0.33, hiMult = 2.5): [number, number] {
  return [Math.round(value * loMult), Math.round(value * hiMult)];
}

// ── Median-based valuation ──────────────────────────────────────────────────
// This is the PRIMARY valuation method. See module-level JSDoc for rationale.

/**
 * Compute the time-weighted median of a set of values.
 *
 * Each value has an associated weight (typically from exponential time-decay).
 * The weighted median is the value where the cumulative weight crosses 50%.
 *
 * Algorithm: sort by value, accumulate weights, find crossing point.
 * Falls back to simple median if all weights are equal.
 */
function weightedMedian(values: number[], weights: number[]): number {
  const pairs = values.map((v, i) => ({ v, w: weights[i] }));
  pairs.sort((a, b) => a.v - b.v);

  const totalWeight = pairs.reduce((s, p) => s + p.w, 0);
  const halfWeight = totalWeight / 2;

  let cumulative = 0;
  for (const pair of pairs) {
    cumulative += pair.w;
    if (cumulative >= halfWeight) return pair.v;
  }
  return pairs[pairs.length - 1].v;
}

/**
 * Compute time-decay weights for sales using exponential decay anchored
 * to the GV2025 valuation date (1 July 2025).
 *
 * weight = exp(-ln(2) × yearsBeforeValuation / halfLife)
 *
 * This makes recent sales count more without discarding older ones entirely.
 * A 2-year half-life means a sale from 2023-07-01 gets weight 0.5,
 * 2021-07-01 gets 0.25, etc.
 */
function computeTimeWeights(fracYears: number[]): number[] {
  const valuationFracYear = dateToFractionalYear(VALUATION_DATE);
  const lambda = Math.LN2 / TIME_WEIGHT_HALF_LIFE_YEARS;
  return fracYears.map((fy) => {
    const yearsBeforeValuation = Math.max(0, valuationFracYear - fy);
    return Math.exp(-lambda * yearsBeforeValuation);
  });
}

function computeMedianValuation(
  enriched: EnrichedSale[],
  property: Property & { dwellingExtent: number },
): MedianValuation {
  const prices = enriched.map((s) => s.pricePerM2Dwelling);
  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;

  const medianPricePerM2 = sorted[Math.floor(n / 2)];
  const q1PricePerM2 = sorted[Math.floor(n * 0.25)];
  const q3PricePerM2 = sorted[Math.floor(n * 0.75)];

  const timeWeights = computeTimeWeights(enriched.map((s) => s.fracYear));
  const timeWeightedMedianPricePerM2 = weightedMedian(prices, timeWeights);

  const dw = property.dwellingExtent;
  const gvPerM2 = property.marketValue / dw;

  let verdict: "overvalued" | "fair" | "undervalued";
  if (gvPerM2 > q3PricePerM2) {
    verdict = "overvalued";
  } else if (gvPerM2 < q1PricePerM2) {
    verdict = "undervalued";
  } else {
    verdict = "fair";
  }

  const pctFromMedian =
    ((property.marketValue - medianPricePerM2 * dw) / (medianPricePerM2 * dw)) * 100;

  return {
    medianPricePerM2,
    timeWeightedMedianPricePerM2,
    q1PricePerM2,
    q3PricePerM2,
    medianValue: medianPricePerM2 * dw,
    timeWeightedValue: timeWeightedMedianPricePerM2 * dw,
    q1Value: q1PricePerM2 * dw,
    q3Value: q3PricePerM2 * dw,
    verdict,
    pctFromMedian,
  };
}

// ── Polynomial regression ───────────────────────────────────────────────────
// SUPPLEMENTARY method — used for trend chart, not for the verdict.
// See module-level JSDoc for why this is secondary.

/**
 * Fit a polynomial of given degree using normal equations (XᵀX β = Xᵀy)
 * solved by Gaussian elimination with partial pivoting.
 *
 * x-values are normalised to zero-mean, unit-variance before fitting
 * to improve numerical stability. The model stores xMean and xStd so
 * polyEval can reverse the normalisation at prediction time.
 */
function polyRegression(xs: number[], ys: number[], degree: number): PolyModel {
  const n = xs.length;
  const size = degree + 1;

  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const xStd = Math.sqrt(xs.reduce((s, x) => s + (x - xMean) ** 2, 0) / n) || 1;
  const xNorm = xs.map((x) => (x - xMean) / xStd);

  // Build normal equations: XᵀX and Xᵀy
  const XtX: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  const Xty: number[] = new Array(size).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < size; j++) {
      for (let k = 0; k < size; k++) {
        XtX[j][k] += xNorm[i] ** (j + k);
      }
      Xty[j] += ys[i] * xNorm[i] ** j;
    }
  }

  // Gaussian elimination with partial pivoting
  const aug = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col < size; col++) {
    let maxRow = col;
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    for (let row = col + 1; row < size; row++) {
      const f = aug[row][col] / aug[col][col];
      for (let j = col; j <= size; j++) aug[row][j] -= f * aug[col][j];
    }
  }

  // Back-substitution
  const coeffs = new Array(size);
  for (let i = size - 1; i >= 0; i--) {
    coeffs[i] = aug[i][size];
    for (let j = i + 1; j < size; j++) coeffs[i] -= aug[i][j] * coeffs[j];
    coeffs[i] /= aug[i][i];
  }

  return { coeffs, xMean, xStd };
}

/** Evaluate a polynomial model at a given fractional year. */
export function polyEval(model: PolyModel, x: number): number {
  const xn = (x - model.xMean) / model.xStd;
  return model.coeffs.reduce((sum, c, i) => sum + c * xn ** i, 0);
}

function rSquared(model: PolyModel, xs: number[], ys: number[]): number {
  const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const ssTot = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const ssRes = xs.reduce((s, x, i) => s + (ys[i] - polyEval(model, x)) ** 2, 0);
  return 1 - ssRes / ssTot;
}

// ── Parse raw sale rows ─────────────────────────────────────────────────────

function parseSalesData(rows: SaleRow[]): ParsedSale[] {
  return rows.map((cols) => {
    const priceNum = parseFloat(cols.salePrice.replace(/[^\d.]/g, "")) || 0;
    return {
      ref: cols.ref,
      address: cols.address,
      description: cols.description,
      erfExtent: parseFloat(cols.erfExtent) || 0,
      dwellingExtent: parseFloat(cols.dwellingExtent) || 0,
      saleDate: cols.saleDate,
      salePrice: priceNum,
    };
  });
}

// ── Main analysis ───────────────────────────────────────────────────────────

export function runAnalysis(
  salesRows: SaleRow[],
  property: Property & { dwellingExtent: number },
  userFilters?: Partial<Filters>
): AnalysisResult {
  const allSales = parseSalesData(salesRows);

  const filters: Filters = {
    minPrice: userFilters?.minPrice ?? 200_000,
    erfRange: userFilters?.erfRange ?? autoRange(property.erfExtent),
    dwellingRange: userFilters?.dwellingRange ?? autoRange(property.dwellingExtent),
    freeholdOnly: userFilters?.freeholdOnly ?? true,
    iqr: userFilters?.iqr ?? 1.5,
  };

  // ── Filtering pipeline ──────────────────────────────────────────────────
  // Each step narrows from "all neighbourhood sales" to "genuine comparables".
  // The log tracks how many sales are removed at each step, which appears
  // in the report for transparency.

  const filterLog: string[] = [];
  filterLog.push(`Total records in dataset: ${allSales.length}`);

  let pool = allSales.filter((s) => s.dwellingExtent > 0 && s.salePrice > 0);
  filterLog.push(
    `After removing zero dwelling/price: ${pool.length} (removed ${allSales.length - pool.length})`
  );

  let prev = pool.length;
  pool = pool.filter((s) => s.salePrice >= filters.minPrice);
  filterLog.push(
    `After min price ≥ R${filters.minPrice.toLocaleString()}: ${pool.length} (removed ${prev - pool.length})`
  );

  if (filters.freeholdOnly) {
    prev = pool.length;
    pool = pool.filter((s) => isFreehold(s.description));
    filterLog.push(
      `After freehold only (excl. SS units): ${pool.length} (removed ${prev - pool.length})`
    );
  }

  prev = pool.length;
  pool = pool.filter(
    (s) => s.erfExtent >= filters.erfRange[0] && s.erfExtent <= filters.erfRange[1]
  );
  filterLog.push(
    `After erf ${filters.erfRange[0]}–${filters.erfRange[1]} m²: ${pool.length} (removed ${prev - pool.length})`
  );

  prev = pool.length;
  pool = pool.filter(
    (s) =>
      s.dwellingExtent >= filters.dwellingRange[0] &&
      s.dwellingExtent <= filters.dwellingRange[1]
  );
  filterLog.push(
    `After dwelling ${filters.dwellingRange[0]}–${filters.dwellingRange[1]} m²: ${pool.length} (removed ${prev - pool.length})`
  );

  let enriched: EnrichedSale[] = pool.map((s) => {
    const date = parseDateStr(s.saleDate);
    const pricePerM2Dwelling = s.salePrice / s.dwellingExtent;
    const pricePerM2Erf = s.salePrice / s.erfExtent;
    const fracYear = dateToFractionalYear(date);
    const tenure = isFreehold(s.description) ? "Freehold" : "Sectional Title";
    return {
      ...s,
      date: date.toISOString(),
      pricePerM2Dwelling,
      pricePerM2Erf,
      fracYear,
      tenure,
    };
  });

  if (enriched.length < 3) {
    throw new Error(
      `Only ${enriched.length} comparable sales remain after filtering. Try widening filters (erf range, dwelling range, min price).`
    );
  }

  // IQR outlier removal — applied to R/m² dwelling to exclude extreme
  // non-representative transactions that survived the earlier filters.
  const prePrices = enriched.map((s) => s.pricePerM2Dwelling);
  const fences = computeIQRFences(prePrices, filters.iqr);
  prev = enriched.length;
  enriched = enriched.filter(
    (s) =>
      s.pricePerM2Dwelling >= fences.lower && s.pricePerM2Dwelling <= fences.upper
  );
  filterLog.push(
    `After IQR outlier removal (R/m² ${fmtR(fences.lower)}–${fmtR(fences.upper)}): ${enriched.length} (removed ${prev - enriched.length})`
  );

  if (enriched.length < 3) {
    throw new Error(
      `Only ${enriched.length} sales remain after IQR removal. Try a higher IQR multiplier or wider filter ranges.`
    );
  }

  enriched.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // ── PRIMARY: Median-based valuation ─────────────────────────────────────
  const medianValuation = computeMedianValuation(enriched, property);

  // ── SUPPLEMENTARY: Polynomial regression (for trend chart) ──────────────
  const xs = enriched.map((s) => s.fracYear);
  const ys = enriched.map((s) => s.pricePerM2Dwelling);
  const model = polyRegression(xs, ys, POLY_DEGREE);
  const r2 = rSquared(model, xs, ys);

  const avgPrice = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sortedYs = [...ys].sort((a, b) => a - b);
  const medianPrice = sortedYs[Math.floor(ys.length / 2)];
  const minPriceVal = Math.min(...ys);
  const maxPriceVal = Math.max(...ys);

  // Regression predictions at target dates (kept for the projected values table).
  // Guard against NaN from degenerate regression (near-singular matrix) —
  // NaN becomes null during JSON serialisation so downstream must handle it.
  const regressionValid = model.coeffs.every((c) => Number.isFinite(c));

  const predictions: Prediction[] = TARGET_DATES.map(({ label, date }) => {
    const fy = dateToFractionalYear(date);
    const predictedPricePerM2 = regressionValid ? polyEval(model, fy) : 0;
    const theoreticalValueDwelling = predictedPricePerM2 * property.dwellingExtent;
    const diffFromGV = theoreticalValueDwelling - property.marketValue;
    const pctFromGV = property.marketValue !== 0 ? (diffFromGV / property.marketValue) * 100 : 0;
    return {
      label,
      dateISO: date.toISOString(),
      fracYear: fy,
      predictedPricePerM2,
      theoreticalValueDwelling,
      diffFromGV,
      pctFromGV,
    };
  });

  // ── Report text ─────────────────────────────────────────────────────────
  const reportText = generateReportText(
    property, enriched, filters, filterLog, fences,
    medianValuation, model, r2, predictions,
  );

  return {
    filterLog,
    stats: {
      count: enriched.length,
      dateRange: [enriched[0].saleDate, enriched[enriched.length - 1].saleDate],
      avgPrice,
      medianPrice,
      minPrice: minPriceVal,
      maxPrice: maxPriceVal,
    },
    fences,
    enrichedSales: enriched,
    medianValuation,
    model,
    r2,
    predictions,
    reportText,
    filters,
  };
}

// ── Text report generation ──────────────────────────────────────────────────

function generateReportText(
  property: Property & { dwellingExtent: number },
  enriched: EnrichedSale[],
  filters: Filters,
  filterLog: string[],
  fences: IQRFences,
  mv: MedianValuation,
  model: PolyModel,
  r2: number,
  predictions: Prediction[]
): string {
  const suburb = extractSuburb(property.address);
  const report: string[] = [];
  const hr = "═".repeat(80);
  const hr2 = "─".repeat(80);

  report.push(hr);
  report.push("OBJECTION MOTIVATION — GV2025 GENERAL VALUATION");
  report.push("City of Cape Town Municipal Property Rates Act, Act 6 of 2004");
  report.push(hr);
  report.push("");

  report.push("1. SUBJECT PROPERTY");
  report.push(hr2);
  report.push(`   Property Reference:  ${property.parcelid}`);
  report.push(`   Address:             ${property.address}`);
  report.push(`   Description:         ${property.description}`);
  report.push(`   Rating Category:     ${property.category}`);
  report.push(`   Erf Extent:          ${property.erfExtent} m²`);
  report.push(`   Dwelling Extent:     ${property.dwellingExtent} m²`);
  report.push(`   GV2025 Valuation:    ${fmtR(property.marketValue)}`);
  report.push(`   GV2025 R/m² Dwelling: ${fmtR(property.marketValue / property.dwellingExtent)}`);
  report.push(`   GV2025 R/m² Erf:     ${fmtR(property.marketValue / property.erfExtent)}`);
  report.push(`   Valuation Date:      1 July 2025`);
  report.push("");

  report.push("2. METHODOLOGY");
  report.push(hr2);
  report.push("   This analysis uses the sales comparison approach — the standard method");
  report.push("   in South African property valuation practice — to determine whether the");
  report.push("   GV2025 assessed value is consistent with actual market transactions.");
  report.push("");
  report.push("   Comparable sales data is sourced from the GV2025 Provision Roll for");
  report.push(`   properties in the ${suburb} area surrounding the subject property.`);
  report.push("");
  report.push("   Two valuation methods are applied:");
  report.push("");
  report.push("   A) MEDIAN-BASED VALUATION (primary)");
  report.push("      The median price per m² of dwelling from comparable sales is");
  report.push("      multiplied by the subject property's dwelling extent to produce");
  report.push("      a market estimate. A time-weighted median (half-life 2 years)");
  report.push("      gives more weight to recent sales. The IQR range (Q1–Q3)");
  report.push("      defines a \"fair value band\" — the middle 50% of comparables.");
  report.push("");
  report.push("   B) POLYNOMIAL REGRESSION (supplementary trend analysis)");
  report.push("      A degree-2 polynomial is fitted to R/m² dwelling vs. date");
  report.push("      to visualise the market trend. R² is reported as a goodness-");
  report.push("      of-fit metric. Note: R² is typically low (0.05–0.15) because");
  report.push("      property prices depend on many factors beyond size and date.");
  report.push("");
  report.push("   Comparable selection criteria:");
  if (filters.freeholdOnly) {
    report.push("     • Freehold properties only (excluding sectional title schemes)");
  }
  report.push(`     • Erf extent: ${filters.erfRange[0]}–${filters.erfRange[1]} m² (subject: ${property.erfExtent} m²)`);
  report.push(`     • Dwelling extent: ${filters.dwellingRange[0]}–${filters.dwellingRange[1]} m² (subject: ${property.dwellingExtent} m²)`);
  report.push(`     • Sale price ≥ R${filters.minPrice.toLocaleString()} (excluding non-market transfers)`);
  report.push(`     • IQR outlier removal on R/m² dwelling (${filters.iqr}× IQR fences)`);
  report.push("");
  report.push("   Filtering pipeline:");
  filterLog.forEach((l) => report.push(`     ${l}`));
  report.push("");
  report.push(`   After filtering, ${enriched.length} comparable sales from the period`);
  report.push(`   ${enriched[0].saleDate} to ${enriched[enriched.length - 1].saleDate} were used for the analysis.`);
  report.push("");

  report.push("3. COMPARABLE SALES SUMMARY STATISTICS");
  report.push(hr2);
  report.push(`   Number of comparable sales:  ${enriched.length}`);
  report.push(`   Date range:                  ${enriched[0].saleDate} — ${enriched[enriched.length - 1].saleDate}`);
  report.push(`   Median  R/m² dwelling:       ${fmtR(mv.medianPricePerM2)}`);
  report.push(`   Time-weighted median R/m²:   ${fmtR(mv.timeWeightedMedianPricePerM2)}`);
  report.push(`   Q1 (25th percentile) R/m²:   ${fmtR(mv.q1PricePerM2)}`);
  report.push(`   Q3 (75th percentile) R/m²:   ${fmtR(mv.q3PricePerM2)}`);
  const ys = enriched.map((s) => s.pricePerM2Dwelling);
  const avgPrice = ys.reduce((a, b) => a + b, 0) / ys.length;
  report.push(`   Average R/m² dwelling:       ${fmtR(avgPrice)}`);
  report.push(`   Minimum R/m² dwelling:       ${fmtR(Math.min(...ys))}`);
  report.push(`   Maximum R/m² dwelling:       ${fmtR(Math.max(...ys))}`);
  report.push(`   IQR fence (lower):           ${fmtR(fences.lower)}`);
  report.push(`   IQR fence (upper):           ${fmtR(fences.upper)}`);
  report.push("");

  const salesTableHeaders = ["#", "Sale Date", "Address", "Sale Price", "Erf m²", "Dwelling m²", "R/m² Dwelling"];
  const salesTableRows = enriched.map((s, i) => [
    String(i + 1),
    s.saleDate,
    s.address.substring(0, 40),
    fmtR(s.salePrice),
    fmtNum(s.erfExtent),
    fmtNum(s.dwellingExtent),
    fmtR(s.pricePerM2Dwelling),
  ]);
  const salesTableAligns = ["R", "L", "L", "R", "R", "R", "R"];

  report.push("4. COMPARABLE SALES TABLE");
  report.push(hr2);
  if (salesTableRows.length <= 60) {
    report.push(table(salesTableHeaders, salesTableRows, salesTableAligns));
  } else {
    const displayRows = [
      ...salesTableRows.slice(0, 10),
      ["...", "...", `... ${salesTableRows.length - 20} more rows ...`, "...", "...", "...", "..."],
      ...salesTableRows.slice(-10),
    ];
    report.push(table(salesTableHeaders, displayRows, salesTableAligns));
  }
  report.push(`\n   Full data: ${enriched.length} records`);
  report.push("");

  report.push("5. MEDIAN-BASED VALUATION (PRIMARY)");
  report.push(hr2);
  report.push(`   Subject dwelling extent:             ${property.dwellingExtent} m²`);
  report.push(`   Median R/m² × dwelling:              ${fmtR(mv.medianPricePerM2)} × ${property.dwellingExtent} = ${fmtR(mv.medianValue)}`);
  report.push(`   Time-weighted median × dwelling:     ${fmtR(mv.timeWeightedMedianPricePerM2)} × ${property.dwellingExtent} = ${fmtR(mv.timeWeightedValue)}`);
  report.push(`   Fair value band (Q1–Q3 × dwelling):  ${fmtR(mv.q1Value)} — ${fmtR(mv.q3Value)}`);
  report.push("");
  report.push(`   GV2025 assessed value:               ${fmtR(property.marketValue)}`);
  report.push(`   GV2025 R/m² dwelling:                ${fmtR(property.marketValue / property.dwellingExtent)}`);
  report.push("");
  if (mv.verdict === "overvalued") {
    report.push(`   VERDICT: OVERVALUED — GV2025 R/m² of ${fmtR(property.marketValue / property.dwellingExtent)}`);
    report.push(`   exceeds the 75th percentile (Q3) of comparable sales (${fmtR(mv.q3PricePerM2)}/m²).`);
    report.push(`   The valuation is ${Math.abs(mv.pctFromMedian).toFixed(1)}% above the median comparable.`);
  } else if (mv.verdict === "undervalued") {
    report.push(`   VERDICT: Undervalued — GV2025 R/m² is below Q1 of comparable sales.`);
  } else {
    report.push(`   VERDICT: Fair — GV2025 R/m² falls within the IQR of comparable sales.`);
  }
  report.push("");

  report.push("6. POLYNOMIAL REGRESSION (SUPPLEMENTARY TREND ANALYSIS)");
  report.push(hr2);
  report.push(`   Model: Degree-${POLY_DEGREE} polynomial (price per m² dwelling vs. date)`);
  report.push(`   R² (coefficient of determination): ${r2.toFixed(4)}`);
  report.push(`   Interpretation: The model explains ${(r2 * 100).toFixed(1)}% of the variance`);
  report.push("   in sale prices per m² of dwelling over the analysis period.");
  if (r2 < 0.2) {
    report.push("");
    report.push("   ⚠ CAVEAT: R² < 0.20 — the regression explains very little of the price");
    report.push("   variance. The trend line should be interpreted with caution. The median-");
    report.push("   based valuation above is the more reliable indicator.");
  }
  report.push("");

  const predHeaders = ["Date", "Predicted R/m²", "× Dwelling m²", "Theoretical Value", "vs GV2025"];
  const predRows = predictions.map((p) => {
    const sign = p.pctFromGV >= 0 ? "+" : "";
    return [
      p.label,
      fmtR(p.predictedPricePerM2),
      `${property.dwellingExtent}`,
      fmtR(p.theoreticalValueDwelling),
      `${sign}${p.pctFromGV.toFixed(1)}%`,
    ];
  });
  const predAligns = ["L", "R", "R", "R", "R"];
  report.push(table(predHeaders, predRows, predAligns));
  report.push("");

  report.push("7. CONCLUSION");
  report.push(hr2);
  if (mv.verdict === "overvalued") {
    report.push(`   Based on the analysis of ${enriched.length} comparable sales in the ${suburb} neighbourhood,`);
    report.push(`   the GV2025 valuation of ${fmtR(property.marketValue)} for the subject property`);
    report.push(`   at ${property.address} is ${Math.abs(mv.pctFromMedian).toFixed(1)}% above`);
    report.push("   the median comparable sale price per m² of dwelling.");
    report.push("");
    report.push(`   The GV2025 R/m² of ${fmtR(property.marketValue / property.dwellingExtent)} exceeds the 75th percentile`);
    report.push(`   of ${fmtR(mv.q3PricePerM2)}/m², placing it outside the fair value band of`);
    report.push(`   ${fmtR(mv.q1Value)} to ${fmtR(mv.q3Value)}.`);
    report.push("");
    report.push(`   The median-based market estimate is ${fmtR(mv.medianValue)}`);
    report.push(`   (time-weighted: ${fmtR(mv.timeWeightedValue)}).`);
    report.push("");
    report.push("   It is respectfully submitted that the GV2025 valuation be reviewed and");
    report.push(`   adjusted to reflect the market-indicated value of approximately ${fmtR(mv.timeWeightedValue)}.`);
  } else if (mv.verdict === "undervalued") {
    report.push("   Based on the analysis, the GV2025 valuation appears to be below");
    report.push("   the market-indicated value. No upward objection is recommended.");
  } else {
    report.push("   Based on the analysis, the GV2025 valuation falls within the middle 50%");
    report.push("   (IQR) of comparable sales and appears to be fairly valued.");
    report.push("   No adjustment is recommended.");
  }
  report.push("");
  report.push(hr);
  report.push(`Report generated: ${new Date().toISOString().slice(0, 10)}`);
  report.push(`Data source: City of Cape Town GV2025 Provision Roll — comparable sales`);
  report.push(`Sales URL: https://web1.capetown.gov.za/web1/gv2025/Sales?parcelid=${property.parcelid.toLowerCase()}`);
  report.push(hr);

  return report.join("\n");
}
