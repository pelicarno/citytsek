"use client";

import { useMemo } from "react";
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
} from "chart.js";
import { Scatter } from "react-chartjs-2";
import { EnrichedSale, PolyModel, Prediction } from "@/lib/types";

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend, TimeScale, Filler);

interface SalesChartProps {
  sales: EnrichedSale[];
  model: PolyModel;
  predictions: Prediction[];
  gvValuePerM2: number;
  /** Median R/m² dwelling — shown as a horizontal line (primary benchmark) */
  medianPricePerM2: number;
  /** Q1 and Q3 R/m² dwelling — shown as a shaded "fair value" band */
  q1PricePerM2: number;
  q3PricePerM2: number;
}

function polyEvalClient(model: PolyModel, x: number): number {
  const xn = (x - model.xMean) / model.xStd;
  return model.coeffs.reduce((sum, c, i) => sum + c * xn ** i, 0);
}

export default function SalesChart({
  sales, model, predictions, gvValuePerM2,
  medianPricePerM2, q1PricePerM2, q3PricePerM2,
}: SalesChartProps) {
  const { chartData, chartOptions } = useMemo(() => {
    const salesPoints = sales.map((s) => ({
      x: s.fracYear,
      y: Math.round(s.pricePerM2Dwelling),
    }));

    const minX = Math.min(...sales.map((s) => s.fracYear));
    const maxX = Math.max(...predictions.map((p) => p.fracYear));
    const step = (maxX - minX) / 100;
    const regressionLine = [];
    for (let x = minX; x <= maxX; x += step) {
      regressionLine.push({ x, y: Math.round(polyEvalClient(model, x)) });
    }

    const predictionPoints = predictions.map((p) => ({
      x: p.fracYear,
      y: Math.round(p.predictedPricePerM2),
    }));

    const gvLine = [
      { x: minX, y: Math.round(gvValuePerM2) },
      { x: maxX, y: Math.round(gvValuePerM2) },
    ];

    const medianLine = [
      { x: minX, y: Math.round(medianPricePerM2) },
      { x: maxX, y: Math.round(medianPricePerM2) },
    ];

    // Q3 line (upper bound of IQR band) — fill down to Q1
    const q3Line = [
      { x: minX, y: Math.round(q3PricePerM2) },
      { x: maxX, y: Math.round(q3PricePerM2) },
    ];
    // Q1 line (lower bound of IQR band)
    const q1Line = [
      { x: minX, y: Math.round(q1PricePerM2) },
      { x: maxX, y: Math.round(q1PricePerM2) },
    ];

    const data = {
      datasets: [
        // IQR band: Q3 line fills down to Q1 line, creating a shaded region
        {
          label: "Fair Value Band (Q1–Q3)",
          data: q3Line,
          borderColor: "rgba(16, 185, 129, 0.3)",
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          showLine: true,
          fill: "+1",
          backgroundColor: "rgba(16, 185, 129, 0.08)",
          order: 5,
        },
        {
          label: "_q1_hidden",
          data: q1Line,
          borderColor: "rgba(16, 185, 129, 0.3)",
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          showLine: true,
          fill: false,
          order: 5,
        },
        {
          label: "Median R/m²",
          data: medianLine,
          borderColor: "rgba(16, 185, 129, 0.9)",
          borderWidth: 2,
          pointRadius: 0,
          showLine: true,
          fill: false,
          order: 4,
        },
        {
          label: "Comparable Sales",
          data: salesPoints,
          backgroundColor: "rgba(59, 130, 246, 0.6)",
          borderColor: "rgba(59, 130, 246, 0.8)",
          pointRadius: 4,
          pointHoverRadius: 6,
          order: 2,
        },
        {
          label: "Regression Trend",
          data: regressionLine,
          borderColor: "rgba(239, 68, 68, 0.5)",
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 0,
          showLine: true,
          fill: false,
          order: 1,
        },
        {
          label: "Projected Values",
          data: predictionPoints,
          backgroundColor: "rgba(239, 68, 68, 0.6)",
          borderColor: "rgba(239, 68, 68, 0.8)",
          pointRadius: 5,
          pointHoverRadius: 7,
          pointStyle: "triangle" as const,
          order: 0,
        },
        {
          label: "GV2025 Valuation (R/m²)",
          data: gvLine,
          borderColor: "rgba(249, 115, 22, 0.7)",
          borderWidth: 2,
          borderDash: [8, 4],
          pointRadius: 0,
          showLine: true,
          fill: false,
          order: 3,
        },
      ],
    };

    const allYs = [
      ...salesPoints.map((p) => p.y),
      ...regressionLine.map((p) => p.y),
      Math.round(gvValuePerM2),
      Math.round(q3PricePerM2),
      Math.round(q1PricePerM2),
    ];
    const yMin = Math.min(...allYs);
    const yMax = Math.max(...allYs);
    const yPadding = (yMax - yMin) * 0.1;

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top" as const,
          labels: {
            usePointStyle: true,
            padding: 16,
            font: { size: 11 },
            filter: (item: { text: string }) => !item.text.startsWith("_"),
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx: { dataset: { label?: string }; parsed: { x: number | null; y: number | null } }) => {
              const xVal = ctx.parsed.x ?? 0;
              const yVal = ctx.parsed.y ?? 0;
              const intYear = Math.floor(xVal);
              const monthFrac = (xVal - intYear) * 12;
              const month = Math.round(monthFrac) + 1;
              const dateStr = `${intYear}/${String(Math.min(month, 12)).padStart(2, "0")}`;
              return `${ctx.dataset.label}: R ${yVal.toLocaleString()} /m² (${dateStr})`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "linear" as const,
          title: {
            display: true,
            text: "Year",
            font: { size: 13, weight: "bold" as const },
          },
          ticks: {
            callback: (value: string | number) => {
              const v = typeof value === "string" ? parseFloat(value) : value;
              return v === Math.floor(v) ? String(v) : "";
            },
          },
        },
        y: {
          title: {
            display: true,
            text: "Price per m² Dwelling (R)",
            font: { size: 13, weight: "bold" as const },
          },
          min: Math.floor((yMin - yPadding) / 1000) * 1000,
          max: Math.ceil((yMax + yPadding) / 1000) * 1000,
          ticks: {
            callback: (value: string | number) => `R ${Number(value).toLocaleString()}`,
          },
        },
      },
    };

    return { chartData: data, chartOptions: options };
  }, [sales, model, predictions, gvValuePerM2, medianPricePerM2, q1PricePerM2, q3PricePerM2]);

  return (
    <div className="h-[420px] w-full">
      <Scatter data={chartData} options={chartOptions} />
    </div>
  );
}
