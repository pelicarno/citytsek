import { describe, it, expect } from "vitest";
import { polyEval, runAnalysis } from "@/lib/analysis";
import { SaleRow, Property, PolyModel } from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSaleRow(overrides: Partial<SaleRow> = {}): SaleRow {
  return {
    ref: "CCT000000000000",
    address: "1 TEST STREET TAMBOERSKLOOF",
    description: "ERF 1234",
    erfExtent: "400",
    dwellingExtent: "180",
    saleDate: "2024/01/15",
    salePrice: "R 3,000,000",
    ...overrides,
  };
}

function makeProperty(
  overrides: Partial<Property & { dwellingExtent: number }> = {},
): Property & { dwellingExtent: number } {
  return {
    parcelid: "CCT999999999999",
    description: "ERF 9999",
    category: "Residential",
    address: "99 TEST ROAD TAMBOERSKLOOF",
    erfExtent: 400,
    marketValue: 4_000_000,
    dwellingExtent: 180,
    ...overrides,
  };
}

function makeSalesDataset(count: number, basePrice = 3_000_000): SaleRow[] {
  return Array.from({ length: count }, (_, i) => {
    const month = String((i % 12) + 1).padStart(2, "0");
    const year = 2022 + Math.floor(i / 12);
    const price = basePrice + (i - count / 2) * 50_000;
    return makeSaleRow({
      ref: `CCT${String(i).padStart(12, "0")}`,
      address: `${i + 1} FAKE STREET TAMBOERSKLOOF`,
      erfExtent: String(350 + (i % 5) * 30),
      dwellingExtent: String(150 + (i % 5) * 20),
      saleDate: `${year}/${month}/15`,
      salePrice: `R ${price.toLocaleString("en-ZA")}`,
    });
  });
}

// ── polyEval ─────────────────────────────────────────────────────────────────

describe("polyEval", () => {
  it("evaluates a constant model correctly", () => {
    const model: PolyModel = { coeffs: [42], xMean: 0, xStd: 1 };
    expect(polyEval(model, 0)).toBe(42);
    expect(polyEval(model, 100)).toBe(42);
  });

  it("evaluates a linear model correctly", () => {
    const model: PolyModel = { coeffs: [10, 5], xMean: 0, xStd: 1 };
    expect(polyEval(model, 0)).toBe(10);
    expect(polyEval(model, 2)).toBe(20);
    expect(polyEval(model, -1)).toBe(5);
  });

  it("evaluates a quadratic model correctly", () => {
    const model: PolyModel = { coeffs: [1, 0, 1], xMean: 0, xStd: 1 };
    expect(polyEval(model, 0)).toBe(1);
    expect(polyEval(model, 3)).toBe(10);
    expect(polyEval(model, -2)).toBe(5);
  });

  it("handles normalisation (xMean/xStd)", () => {
    const model: PolyModel = { coeffs: [100, 50], xMean: 2024, xStd: 2 };
    // x=2024 → normalised = 0 → 100 + 50*0 = 100
    expect(polyEval(model, 2024)).toBe(100);
    // x=2026 → normalised = 1 → 100 + 50*1 = 150
    expect(polyEval(model, 2026)).toBe(150);
  });
});

// ── runAnalysis ──────────────────────────────────────────────────────────────

describe("runAnalysis", () => {
  it("throws when fewer than 3 sales survive filtering", () => {
    const sales = [makeSaleRow(), makeSaleRow()];
    const property = makeProperty();
    expect(() => runAnalysis(sales, property)).toThrow(/comparable sales remain/);
  });

  it("throws when all sales have zero dwelling", () => {
    const sales = Array.from({ length: 10 }, () => makeSaleRow({ dwellingExtent: "0" }));
    const property = makeProperty();
    expect(() => runAnalysis(sales, property)).toThrow();
  });

  it("returns a valid result with sufficient data", () => {
    const sales = makeSalesDataset(20);
    const property = makeProperty();
    const result = runAnalysis(sales, property);

    expect(result.enrichedSales.length).toBeGreaterThanOrEqual(3);
    expect(result.filterLog.length).toBeGreaterThan(0);
    expect(result.stats.count).toBe(result.enrichedSales.length);
    expect(result.model.coeffs).toHaveLength(3); // degree-2 → 3 coefficients
    expect(result.r2).toBeGreaterThanOrEqual(0);
    expect(result.r2).toBeLessThanOrEqual(1);
    expect(result.predictions.length).toBe(5);
    expect(result.reportText).toContain("OBJECTION MOTIVATION");
  });

  it("median valuation produces expected structure", () => {
    const sales = makeSalesDataset(20);
    const property = makeProperty();
    const result = runAnalysis(sales, property);

    const mv = result.medianValuation;
    expect(mv.medianPricePerM2).toBeGreaterThan(0);
    expect(mv.q1PricePerM2).toBeLessThanOrEqual(mv.medianPricePerM2);
    expect(mv.q3PricePerM2).toBeGreaterThanOrEqual(mv.medianPricePerM2);
    expect(["overvalued", "fair", "undervalued"]).toContain(mv.verdict);
    expect(mv.medianValue).toBeCloseTo(mv.medianPricePerM2 * property.dwellingExtent, 0);
  });

  it("respects custom filters", () => {
    const sales = makeSalesDataset(30);
    const property = makeProperty();

    const strict = runAnalysis(sales, property, {
      minPrice: 3_000_000,
      erfRange: [380, 420],
      dwellingRange: [170, 200],
    });

    const loose = runAnalysis(sales, property, {
      minPrice: 100_000,
      erfRange: [100, 2000],
      dwellingRange: [50, 1000],
    });

    expect(loose.enrichedSales.length).toBeGreaterThanOrEqual(strict.enrichedSales.length);
  });

  it("IQR fences are computed correctly", () => {
    const sales = makeSalesDataset(20);
    const property = makeProperty();
    const result = runAnalysis(sales, property);

    expect(result.fences.q1).toBeLessThan(result.fences.q3);
    expect(result.fences.iqr).toBe(result.fences.q3 - result.fences.q1);
    expect(result.fences.lower).toBe(result.fences.q1 - 1.5 * result.fences.iqr);
    expect(result.fences.upper).toBe(result.fences.q3 + 1.5 * result.fences.iqr);
  });

  it("predictions include the GV2025 valuation date", () => {
    const sales = makeSalesDataset(20);
    const property = makeProperty();
    const result = runAnalysis(sales, property);

    const gv2025Pred = result.predictions.find((p) => p.label.includes("GV2025"));
    expect(gv2025Pred).toBeDefined();
    expect(gv2025Pred!.predictedPricePerM2).toBeGreaterThan(0);
  });

  it("report text contains property reference", () => {
    const sales = makeSalesDataset(20);
    const property = makeProperty({ parcelid: "CCT123456789012" });
    const result = runAnalysis(sales, property);

    expect(result.reportText).toContain("CCT123456789012");
  });

  it("correctly identifies an overvalued property", () => {
    const sales = makeSalesDataset(20, 1_500_000);
    const property = makeProperty({ marketValue: 10_000_000, dwellingExtent: 180 });
    const result = runAnalysis(sales, property);

    expect(result.medianValuation.verdict).toBe("overvalued");
  });
});
