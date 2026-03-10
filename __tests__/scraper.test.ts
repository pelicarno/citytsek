import { describe, it, expect } from "vitest";
import { detectDwellingFromSales } from "@/lib/scraper";
import { SaleRow } from "@/lib/types";

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

describe("detectDwellingFromSales", () => {
  it("returns dwelling extent when parcelid matches", () => {
    const rows: SaleRow[] = [
      makeSaleRow({ ref: "CCT111111111111", dwellingExtent: "200" }),
      makeSaleRow({ ref: "CCT222222222222", dwellingExtent: "150" }),
    ];
    expect(detectDwellingFromSales(rows, "CCT111111111111")).toBe(200);
  });

  it("returns null when no matching parcelid", () => {
    const rows: SaleRow[] = [makeSaleRow({ ref: "CCT111111111111", dwellingExtent: "200" })];
    expect(detectDwellingFromSales(rows, "CCT999999999999")).toBeNull();
  });

  it("returns null when matching row has zero dwelling", () => {
    const rows: SaleRow[] = [makeSaleRow({ ref: "CCT111111111111", dwellingExtent: "0" })];
    expect(detectDwellingFromSales(rows, "CCT111111111111")).toBeNull();
  });

  it("is case-insensitive on parcelid", () => {
    const rows: SaleRow[] = [makeSaleRow({ ref: "cct111111111111", dwellingExtent: "175" })];
    expect(detectDwellingFromSales(rows, "CCT111111111111")).toBe(175);
  });

  it("returns the first matching row", () => {
    const rows: SaleRow[] = [
      makeSaleRow({ ref: "CCT111111111111", dwellingExtent: "200" }),
      makeSaleRow({ ref: "CCT111111111111", dwellingExtent: "250" }),
    ];
    expect(detectDwellingFromSales(rows, "CCT111111111111")).toBe(200);
  });

  it("returns null for empty sales array", () => {
    expect(detectDwellingFromSales([], "CCT111111111111")).toBeNull();
  });
});
