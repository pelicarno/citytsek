"use client";

import { useState } from "react";
import { AnalysisResult, Property } from "@/lib/types";
import SalesChart from "./SalesChart";

interface ReportProps {
  property: Property & { dwellingExtent: number };
  result: AnalysisResult;
}

function fmtR(n: number): string {
  return "R " + Math.round(n).toLocaleString("en-ZA");
}

function csvEscape(val: string | number): string {
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvRow(...cells: (string | number)[]): string {
  return cells.map(csvEscape).join(",");
}

function generateAuditCSV(
  property: Property & { dwellingExtent: number },
  result: AnalysisResult,
): string {
  const {
    enrichedSales,
    stats,
    fences,
    filters,
    medianValuation: mv,
    r2,
    predictions,
    filterLog,
  } = result;
  const gvPerM2 = property.marketValue / property.dwellingExtent;
  const lines: string[] = [];

  // Section 1: Subject Property
  lines.push(csvRow("SUBJECT PROPERTY"));
  lines.push(csvRow("Field", "Value"));
  lines.push(csvRow("Property Reference", property.parcelid));
  lines.push(csvRow("Address", property.address));
  lines.push(csvRow("Description", property.description));
  lines.push(csvRow("Category", property.category));
  lines.push(csvRow("Erf Extent (m²)", property.erfExtent));
  lines.push(csvRow("Dwelling Extent (m²)", property.dwellingExtent));
  lines.push(csvRow("GV2025 Valuation", property.marketValue));
  lines.push(csvRow("GV2025 R/m² Dwelling", Math.round(gvPerM2)));
  lines.push(csvRow("GV2025 R/m² Erf", Math.round(property.marketValue / property.erfExtent)));
  lines.push("");

  // Section 2: Filter Criteria
  lines.push(csvRow("FILTER CRITERIA"));
  lines.push(csvRow("Filter", "Value"));
  lines.push(csvRow("Min Sale Price", filters.minPrice));
  lines.push(csvRow("Erf Range (m²)", `${filters.erfRange[0]} – ${filters.erfRange[1]}`));
  lines.push(
    csvRow("Dwelling Range (m²)", `${filters.dwellingRange[0]} – ${filters.dwellingRange[1]}`),
  );
  lines.push(csvRow("Freehold Only", filters.freeholdOnly ? "Yes" : "No"));
  lines.push(csvRow("IQR Multiplier", filters.iqr));
  lines.push("");

  // Section 3: Filtering Pipeline
  lines.push(csvRow("FILTERING PIPELINE"));
  for (const entry of filterLog) {
    lines.push(csvRow(entry));
  }
  lines.push("");

  // Section 4: Median Valuation Calculation (the auditable bit)
  lines.push(csvRow("VALUATION CALCULATION"));
  lines.push(csvRow("Metric", "R/m²", "× Dwelling m²", "= Total Value"));
  lines.push(
    csvRow(
      "Median",
      Math.round(mv.medianPricePerM2),
      property.dwellingExtent,
      Math.round(mv.medianValue),
    ),
  );
  lines.push(
    csvRow(
      "Time-Weighted Median",
      Math.round(mv.timeWeightedMedianPricePerM2),
      property.dwellingExtent,
      Math.round(mv.timeWeightedValue),
    ),
  );
  lines.push(
    csvRow(
      "Q1 (25th percentile)",
      Math.round(mv.q1PricePerM2),
      property.dwellingExtent,
      Math.round(mv.q1Value),
    ),
  );
  lines.push(
    csvRow(
      "Q3 (75th percentile)",
      Math.round(mv.q3PricePerM2),
      property.dwellingExtent,
      Math.round(mv.q3Value),
    ),
  );
  lines.push(csvRow("GV2025", Math.round(gvPerM2), property.dwellingExtent, property.marketValue));
  lines.push("");
  lines.push(csvRow("Verdict", mv.verdict));
  lines.push(csvRow("% From Median", `${mv.pctFromMedian.toFixed(1)}%`));
  lines.push(csvRow("Difference", Math.round(property.marketValue - mv.medianValue)));
  lines.push("");

  // Section 5: Summary Statistics
  lines.push(csvRow("SUMMARY STATISTICS"));
  lines.push(csvRow("Statistic", "Value"));
  lines.push(csvRow("Comparable Sales Count", stats.count));
  lines.push(csvRow("Date Range", `${stats.dateRange[0]} – ${stats.dateRange[1]}`));
  lines.push(csvRow("Average R/m² Dwelling", Math.round(stats.avgPrice)));
  lines.push(csvRow("Median R/m² Dwelling", Math.round(stats.medianPrice)));
  lines.push(csvRow("Min R/m² Dwelling", Math.round(stats.minPrice)));
  lines.push(csvRow("Max R/m² Dwelling", Math.round(stats.maxPrice)));
  lines.push(csvRow("IQR Q1 Fence", Math.round(fences.q1)));
  lines.push(csvRow("IQR Q3 Fence", Math.round(fences.q3)));
  lines.push(csvRow("IQR Lower Bound", Math.round(fences.lower)));
  lines.push(csvRow("IQR Upper Bound", Math.round(fences.upper)));
  lines.push("");

  // Section 6: Regression Predictions
  lines.push(csvRow("REGRESSION PREDICTIONS (SUPPLEMENTARY)"));
  lines.push(csvRow("R²", r2.toFixed(4)));
  lines.push(csvRow("Date", "Predicted R/m²", "Theoretical Value", "vs GV2025"));
  for (const p of predictions) {
    lines.push(
      csvRow(
        p.label,
        Math.round(p.predictedPricePerM2),
        Math.round(p.theoreticalValueDwelling),
        `${p.pctFromGV >= 0 ? "+" : ""}${p.pctFromGV.toFixed(1)}%`,
      ),
    );
  }
  lines.push("");

  // Section 7: Comparable Sales (full data for audit)
  lines.push(csvRow("COMPARABLE SALES DATA"));
  lines.push(
    csvRow(
      "#",
      "Sale Date",
      "Property Ref",
      "Address",
      "Description",
      "Tenure",
      "Erf m²",
      "Dwelling m²",
      "Sale Price",
      "R/m² Dwelling (Sale Price ÷ Dwelling m²)",
      "R/m² Erf (Sale Price ÷ Erf m²)",
    ),
  );
  for (let i = 0; i < enrichedSales.length; i++) {
    const s = enrichedSales[i];
    lines.push(
      csvRow(
        i + 1,
        s.saleDate,
        s.ref,
        s.address,
        s.description,
        s.tenure,
        s.erfExtent,
        s.dwellingExtent,
        s.salePrice,
        Math.round(s.pricePerM2Dwelling),
        Math.round(s.pricePerM2Erf),
      ),
    );
  }
  lines.push("");

  lines.push(csvRow("Report generated", new Date().toISOString().slice(0, 10)));
  lines.push(csvRow("Data source", "City of Cape Town GV2025 Provision Roll"));

  return lines.join("\n");
}

function Section({
  title,
  num,
  children,
}: {
  title: string;
  num: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
        {num}. {title}
      </h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-zinc-100 py-1.5 dark:border-zinc-800">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-medium text-zinc-800 dark:text-zinc-200">{value}</span>
    </div>
  );
}

export default function Report({ property, result }: ReportProps) {
  const [showAllSales, setShowAllSales] = useState(false);
  const {
    enrichedSales,
    stats,
    fences,
    predictions,
    r2,
    filterLog,
    filters,
    medianValuation: mv,
  } = result;
  const gvValuePerM2 = property.marketValue / property.dwellingExtent;

  const displaySales = showAllSales ? enrichedSales : enrichedSales.slice(0, 25);

  const verdictColor = {
    overvalued: {
      border: "border-red-200 dark:border-red-800/50",
      bg: "bg-red-50 dark:bg-red-950/30",
      text: "text-red-700 dark:text-red-400",
    },
    fair: {
      border: "border-green-200 dark:border-green-800/50",
      bg: "bg-green-50 dark:bg-green-950/30",
      text: "text-green-700 dark:text-green-400",
    },
    undervalued: {
      border: "border-blue-200 dark:border-blue-800/50",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      text: "text-blue-700 dark:text-blue-400",
    },
  }[mv.verdict];

  const verdictLabel = {
    overvalued: `Overvalued by ${fmtR(Math.abs(property.marketValue - mv.medianValue))} (${Math.abs(mv.pctFromMedian).toFixed(1)}% above median)`,
    fair: "Within fair value range",
    undervalued: `Below market — ${Math.abs(mv.pctFromMedian).toFixed(1)}% below median`,
  }[mv.verdict];

  const [copied, setCopied] = useState(false);

  function shareReport() {
    const url = new URL(window.location.href);
    url.searchParams.set("ref", property.parcelid);
    url.searchParams.set("dwelling", String(property.dwellingExtent));
    const f = result.filters;
    url.searchParams.set("minPrice", String(f.minPrice));
    url.searchParams.set("erfLo", String(f.erfRange[0]));
    url.searchParams.set("erfHi", String(f.erfRange[1]));
    url.searchParams.set("dwellingLo", String(f.dwellingRange[0]));
    url.searchParams.set("dwellingHi", String(f.dwellingRange[1]));
    url.searchParams.set("iqr", String(f.iqr));
    url.searchParams.set("freehold", f.freeholdOnly ? "1" : "0");
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadReport() {
    const blob = new Blob([result.reportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `valuation_motivation_${property.parcelid}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadSpreadsheet() {
    const csv = generateAuditCSV(property, result);
    const bom = "\uFEFF";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `valuation_audit_${property.parcelid}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      {/* Header + download */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
            Valuation Analysis Report
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            GV2025 General Valuation — Municipal Property Rates Act, Act 6 of 2004
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={shareReport}
            className="flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            {copied ? "Link Copied!" : "Share"}
          </button>
          <button
            onClick={downloadSpreadsheet}
            className="flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            Download Spreadsheet
          </button>
          <button
            onClick={downloadReport}
            className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download Report
          </button>
        </div>
      </div>

      {/* Verdict banner — uses median-based verdict, not regression */}
      <div className={`rounded-xl border-2 p-5 ${verdictColor.border} ${verdictColor.bg}`}>
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Assessment (based on {stats.count} comparable sales)
        </p>
        <p className={`mt-1 text-xl font-bold ${verdictColor.text}`}>{verdictLabel}</p>
        <div className="mt-3 grid gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          <p>
            GV2025 valuation:{" "}
            <strong className="text-zinc-800 dark:text-zinc-200">
              {fmtR(property.marketValue)}
            </strong>{" "}
            ({fmtR(gvValuePerM2)}/m²)
          </p>
          <p>
            Median market estimate:{" "}
            <strong className="text-zinc-800 dark:text-zinc-200">{fmtR(mv.medianValue)}</strong> (
            {fmtR(mv.medianPricePerM2)}/m²)
          </p>
          <p>
            Fair value band (Q1–Q3):{" "}
            <strong className="text-zinc-800 dark:text-zinc-200">
              {fmtR(mv.q1Value)} — {fmtR(mv.q3Value)}
            </strong>
          </p>
        </div>
      </div>

      {/* 1. Subject Property */}
      <Section title="Subject Property" num={1}>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <Stat label="Property Reference" value={property.parcelid} />
          <Stat label="Address" value={property.address} />
          <Stat label="Description" value={property.description} />
          <Stat label="Category" value={property.category} />
          <Stat label="Erf Extent" value={`${property.erfExtent} m²`} />
          <Stat label="Dwelling Extent" value={`${property.dwellingExtent} m²`} />
          <Stat label="GV2025 Valuation" value={fmtR(property.marketValue)} />
          <Stat label="GV2025 R/m² Dwelling" value={fmtR(gvValuePerM2)} />
          <Stat label="GV2025 R/m² Erf" value={fmtR(property.marketValue / property.erfExtent)} />
        </div>
      </Section>

      {/* 2. Methodology / Filtering */}
      <Section title="Filtering Pipeline" num={2}>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
              Min price: R{filters.minPrice.toLocaleString()}
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
              Erf: {filters.erfRange[0]}–{filters.erfRange[1]} m²
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
              Dwelling: {filters.dwellingRange[0]}–{filters.dwellingRange[1]} m²
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
              {filters.freeholdOnly ? "Freehold only" : "All tenure types"}
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">
              IQR: {filters.iqr}×
            </span>
          </div>
          <div className="space-y-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
            {filterLog.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      </Section>

      {/* 3. Median-Based Valuation (PRIMARY) */}
      <Section title="Median-Based Valuation" num={3}>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
            Primary method — sales comparison approach using R/m² dwelling distribution
          </p>
          <Stat label="Median R/m² Dwelling" value={fmtR(mv.medianPricePerM2)} />
          <Stat label="Time-Weighted Median R/m²" value={fmtR(mv.timeWeightedMedianPricePerM2)} />
          <Stat label="Q1 (25th percentile)" value={fmtR(mv.q1PricePerM2)} />
          <Stat label="Q3 (75th percentile)" value={fmtR(mv.q3PricePerM2)} />
          <div className="my-3 border-t border-zinc-200 dark:border-zinc-700" />
          <Stat label="Median Market Estimate" value={fmtR(mv.medianValue)} />
          <Stat label="Time-Weighted Estimate" value={fmtR(mv.timeWeightedValue)} />
          <Stat
            label="Fair Value Band (Q1–Q3)"
            value={`${fmtR(mv.q1Value)} — ${fmtR(mv.q3Value)}`}
          />
          <div className="my-3 border-t border-zinc-200 dark:border-zinc-700" />
          <Stat label="GV2025 R/m² Dwelling" value={fmtR(gvValuePerM2)} />
          <Stat
            label="Verdict"
            value={
              mv.verdict === "overvalued"
                ? `Overvalued (${Math.abs(mv.pctFromMedian).toFixed(1)}% above median)`
                : mv.verdict === "undervalued"
                  ? `Undervalued (${Math.abs(mv.pctFromMedian).toFixed(1)}% below median)`
                  : "Fair (within Q1–Q3 range)"
            }
          />
        </div>
      </Section>

      {/* 4. Summary Statistics */}
      <Section title="Summary Statistics" num={4}>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <Stat label="Comparable Sales" value={String(stats.count)} />
          <Stat label="Date Range" value={`${stats.dateRange[0]} — ${stats.dateRange[1]}`} />
          <Stat label="Average R/m² Dwelling" value={fmtR(stats.avgPrice)} />
          <Stat label="Median R/m² Dwelling" value={fmtR(stats.medianPrice)} />
          <Stat label="Minimum R/m² Dwelling" value={fmtR(stats.minPrice)} />
          <Stat label="Maximum R/m² Dwelling" value={fmtR(stats.maxPrice)} />
          <Stat label="IQR Q1" value={fmtR(fences.q1)} />
          <Stat label="IQR Q3" value={fmtR(fences.q3)} />
        </div>
      </Section>

      {/* 5. Chart */}
      <Section title="Market Trend Analysis" num={5}>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <SalesChart
            sales={enrichedSales}
            model={result.model}
            predictions={predictions}
            gvValuePerM2={gvValuePerM2}
            medianPricePerM2={mv.medianPricePerM2}
            q1PricePerM2={mv.q1PricePerM2}
            q3PricePerM2={mv.q3PricePerM2}
          />
          <div className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
            <p>
              Degree-2 polynomial regression — R² = {r2.toFixed(4)} ({(r2 * 100).toFixed(1)}%
              variance explained)
            </p>
            {r2 < 0.2 && (
              <p className="mt-1 text-amber-600 dark:text-amber-400">
                R² &lt; 0.20 — regression trend is weak. The horizontal median / Q1–Q3 band is more
                reliable.
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* 6. Comparable Sales Table */}
      <Section title="Comparable Sales" num={6}>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Address</th>
                <th className="px-3 py-2 text-right">Sale Price</th>
                <th className="px-3 py-2 text-right">Erf m²</th>
                <th className="px-3 py-2 text-right">Dwelling m²</th>
                <th className="px-3 py-2 text-right">R/m²</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
              {displaySales.map((s, i) => (
                <tr
                  key={`${s.ref}-${s.saleDate}-${i}`}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <td className="px-3 py-1.5 text-zinc-400">{i + 1}</td>
                  <td className="px-3 py-1.5">{s.saleDate}</td>
                  <td className="max-w-[200px] truncate px-3 py-1.5">{s.address}</td>
                  <td className="px-3 py-1.5 text-right">{fmtR(s.salePrice)}</td>
                  <td className="px-3 py-1.5 text-right">{s.erfExtent}</td>
                  <td className="px-3 py-1.5 text-right">{s.dwellingExtent}</td>
                  <td className="px-3 py-1.5 text-right font-medium">
                    {fmtR(s.pricePerM2Dwelling)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {enrichedSales.length > 25 && (
          <button
            onClick={() => setShowAllSales(!showAllSales)}
            className="mt-2 text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
          >
            {showAllSales ? "Show less" : `Show all ${enrichedSales.length} sales`}
          </button>
        )}
      </Section>

      {/* 7. Regression Projected Values (supplementary) */}
      <Section title="Regression Trend (Supplementary)" num={7}>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-right">Predicted R/m²</th>
                <th className="px-3 py-2 text-right">Theoretical Value</th>
                <th className="px-3 py-2 text-right">vs GV2025</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
              {predictions.map((p) => {
                const pct = p.pctFromGV ?? 0;
                const sign = pct >= 0 ? "+" : "";
                const colorClass =
                  pct < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400";
                return (
                  <tr key={p.label} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                    <td className="px-3 py-1.5">{p.label}</td>
                    <td className="px-3 py-1.5 text-right">{fmtR(p.predictedPricePerM2 ?? 0)}</td>
                    <td className="px-3 py-1.5 text-right font-medium">
                      {fmtR(p.theoreticalValueDwelling ?? 0)}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-medium ${colorClass}`}>
                      {sign}
                      {pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {r2 < 0.2 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            R² = {r2.toFixed(4)} — the regression explains very little price variance. These
            projections should be treated as indicative only. The median-based valuation above is
            the more reliable estimate.
          </p>
        )}
      </Section>

      {/* 8. Conclusion */}
      <Section title="Conclusion" num={8}>
        <div className={`rounded-lg border-2 p-5 ${verdictColor.border} ${verdictColor.bg}`}>
          {mv.verdict === "overvalued" ? (
            <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
              <p>
                Based on the analysis of <strong>{stats.count}</strong> comparable sales, the GV2025
                valuation of <strong>{fmtR(property.marketValue)}</strong> for{" "}
                <strong>{property.address}</strong> is{" "}
                <strong className={verdictColor.text}>
                  {Math.abs(mv.pctFromMedian).toFixed(1)}% above
                </strong>{" "}
                the median comparable sale and exceeds the 75th percentile (Q3) of{" "}
                <strong>{fmtR(mv.q3PricePerM2)}/m²</strong>.
              </p>
              <p>
                The median market estimate is <strong>{fmtR(mv.medianValue)}</strong>{" "}
                (time-weighted: <strong>{fmtR(mv.timeWeightedValue)}</strong>). The fair value band
                is {fmtR(mv.q1Value)} to {fmtR(mv.q3Value)}.
              </p>
              <p>
                It is respectfully submitted that the GV2025 valuation be reviewed and adjusted to
                reflect the market-indicated value of approximately{" "}
                <strong>{fmtR(mv.timeWeightedValue)}</strong>.
              </p>
            </div>
          ) : mv.verdict === "undervalued" ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Based on the analysis, the GV2025 valuation of{" "}
              <strong>{fmtR(property.marketValue)}</strong> appears to be below the market-indicated
              value (median: {fmtR(mv.medianValue)}). No upward objection is recommended.
            </p>
          ) : (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Based on the analysis of <strong>{stats.count}</strong> comparable sales, the GV2025
              valuation of <strong>{fmtR(property.marketValue)}</strong> falls within the middle 50%
              (IQR) of comparable sales ({fmtR(mv.q1Value)} to {fmtR(mv.q3Value)}) and appears to be
              fairly valued.
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
