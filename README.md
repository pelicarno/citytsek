# StadSeKant — GV2025 Valuation Analyser (Web App)

Next.js web application that analyses City of Cape Town GV2025 property valuations
against comparable sales data and produces an objection motivation report.

**Live flow:** Enter property reference → scrape neighbourhood sales → filter →
analyse with dual methodology → display interactive report with chart.

---

## Architecture

```
app/
  page.tsx              Main SPA page (lookup form → dwelling prompt → results)
  layout.tsx            Root layout, metadata, Geist fonts
  globals.css           Tailwind base styles
  api/
    lookup/route.ts     POST /api/lookup — property lookup + sales scraping
    analyze/route.ts    POST /api/analyze — run valuation analysis

components/
  Report.tsx            Results display (verdict, stats, sales table, chart)
  SalesChart.tsx        Chart.js scatter plot with regression + median band
  Loader.tsx            Loading spinner

lib/
  scraper.ts            Property lookup + sales scraping from City of Cape Town
  analysis.ts           ★ Core analysis engine — filtering, median valuation, regression
  types.ts              TypeScript interfaces (Property, SaleRow, MedianValuation, etc.)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| Frontend | React, TypeScript |
| Styling | Tailwind CSS |
| Charts | Chart.js, react-chartjs-2 |
| Data source | City of Cape Town GV2025 Provision Roll (HTML scraping) |

---

## Valuation Methodology

> **If you are an AI agent working on this codebase, read this section carefully.**
> The methodology has been deliberately designed this way. Do not change the
> primary/supplementary hierarchy without understanding the rationale below.

### The Core Question

"Is the City's GV2025 assessed value for this property consistent with what
similar properties in the neighbourhood actually sold for?"

This is fundamentally a **cross-sectional** question (comparing a property to
its peers), not a **time-series** question (predicting a trend).

### Dual-Method Approach

Two methods are used. They serve different purposes:

#### Method A: Median-Based Valuation (PRIMARY — drives the verdict)

**What:** Standard "sales comparison approach" used in South African property
valuation practice and recognised by valuation tribunals.

**How:**
1. Filter neighbourhood sales to genuine comparables (see Filtering Pipeline below)
2. Compute R/m² dwelling for each sale
3. Calculate the **median R/m²** and **IQR (Q1, Q3)** of the distribution
4. Also calculate a **time-weighted median** using exponential decay (half-life
   2 years from valuation date) to give more weight to recent sales
5. Market estimate = median R/m² × subject dwelling extent
6. Fair value band = Q1 × dwelling extent to Q3 × dwelling extent

**Verdict logic:**
- **Overvalued:** GV2025 R/m² > Q3 (above 75th percentile of comparables)
- **Fair:** Q1 ≤ GV2025 R/m² ≤ Q3 (within the middle 50%)
- **Undervalued:** GV2025 R/m² < Q1 (below 25th percentile)

**Why this is primary:**
- Transparent and model-free — no assumptions about functional form
- Standard practice — what municipal valuation panels expect
- Robust — the median is resistant to outliers
- The time-weighted variant handles price appreciation without needing a
  regression model
- Hard for an assessor to dismiss: "here are N comparable sales, your
  valuation exceeds 75% of them"

**Implementation:** `computeMedianValuation()` in `lib/analysis.ts`

#### Method B: Polynomial Regression (SUPPLEMENTARY — chart only)

**What:** Degree-2 polynomial regression of R/m² dwelling (y) vs fractional
year (x).

**How:**
1. Normalise x-values to zero-mean, unit-variance for numerical stability
2. Build normal equations (XᵀX β = Xᵀy)
3. Solve via Gaussian elimination with partial pivoting
4. Evaluate at target dates to project R/m²
5. Report R² as goodness-of-fit metric

**Why this is supplementary (not primary):**
- R² is typically **0.05–0.15** for residential property. This means the model
  explains only 5–15% of price variance.
- Property prices depend on many unobserved factors (condition, renovations,
  views, aspect, garden, pool, proximity to amenities) that are not captured
  by dwelling size and date alone.
- A point estimate from such a weak model has wide uncertainty.
- A municipal assessor could validly dismiss it: "your model explains 8% of
  variance — you can't draw conclusions from it."
- Polynomial extrapolation beyond the data range is unreliable (degree-2 curves
  swing wildly outside the fitted window).

**What it IS useful for:**
- Visualising the general market trend on the scatter chart
- Confirming whether prices are trending up or down over time
- Providing supplementary projected values at future dates

**When it becomes primary:** If R² > ~0.3 (rare for residential property with
only size and date as features), the regression is more trustworthy. The R²
caveat in the report automatically flags when R² < 0.20.

**Implementation:** `polyRegression()`, `polyEval()`, `rSquared()` in `lib/analysis.ts`

### Time-Weighted Median

The time-weighted median addresses the concern that older sales may not reflect
current market conditions. Instead of discarding old sales (which reduces sample
size), it downweights them using exponential decay:

```
weight(sale) = exp(-ln(2) × yearsBeforeValuation / halfLife)
```

With `halfLife = 2 years`:
- Sale from 2023-07-01 (2 years before valuation): weight 0.50
- Sale from 2021-07-01 (4 years before valuation): weight 0.25
- Sale from 2019-07-01 (6 years before valuation): weight 0.125
- Sale from 2025-07-01 (valuation date): weight 1.00

The weighted median is computed by sorting values, accumulating weights, and
finding where cumulative weight crosses 50%.

**Implementation:** `weightedMedian()`, `computeTimeWeights()` in `lib/analysis.ts`

### Filtering Pipeline

Sales are filtered in this order (each step logged for transparency):

1. **Remove zero values** — records with zero dwelling extent or zero sale price
2. **Minimum price** — default R200,000 to exclude non-market transfers
   (family transfers, estate settlements, etc.)
3. **Freehold only** — excludes sectional title schemes (descriptions matching
   `SS*` patterns) by default
4. **Erf extent range** — default 0.33x–2.5x the subject property's erf
5. **Dwelling extent range** — default 0.33x–2.5x the subject property's dwelling
6. **IQR outlier removal** — removes sales where R/m² dwelling falls outside
   Q1 - 1.5×IQR to Q3 + 1.5×IQR fences

Minimum 3 comparable sales required after filtering. If fewer remain, the
analysis throws an error suggesting the user widen filters.

### Chart Visualisation

The scatter chart (`SalesChart.tsx`) shows:

| Element | Colour | Purpose |
|---------|--------|---------|
| Blue dots | `rgba(59,130,246)` | Individual comparable sales |
| Green solid line | `rgba(16,185,129)` | Median R/m² (primary benchmark) |
| Green shaded band | `rgba(16,185,129,0.08)` | Q1–Q3 fair value range |
| Red dashed line | `rgba(239,68,68,0.5)` | Polynomial regression trend (supplementary) |
| Red triangles | `rgba(239,68,68)` | Regression projected values |
| Orange dashed line | `rgba(249,115,22)` | GV2025 valuation R/m² |

The Q1–Q3 band uses Chart.js `fill: "+1"` to shade between the Q3 line and
the next dataset (Q1 line). The Q1 dataset label starts with `_` so it's
hidden from the legend via a filter function.

---

## Property Lookup and Dwelling Extent

### Lookup Flow

1. User enters a **property reference** (e.g. `CCT015775300000`)
2. ERF numbers (digits only) are **rejected** — they can match multiple
   properties across suburbs, creating ambiguity
3. The scraper queries `Results?Search=VAL,<ref>` for an exact match

### Dwelling Extent Detection (ASP.NET Postback Flow)

The City's GV2025 site uses ASP.NET Web Forms with postback navigation.
The dwelling extent lives on the `DetStructRes` page, which cannot be
accessed by direct URL — it requires an active session established through
the Results page.

**How the scraper navigates this:**
1. GET the Results page → extract `ASP.NET_SessionId` cookie + hidden form
   fields (`__VIEWSTATE`, `__EVENTVALIDATION`, `__VIEWSTATEGENERATOR`)
2. POST back to the same URL with `__EVENTTARGET` set to the property
   reference link's postback target (e.g. `dgSearch$ctl03$lbParcelId`)
3. Server responds with 302 redirect to `DetStructRes.aspx?parcelid_i=...&id=...`
4. GET the redirect URL with the session cookie → parse dwelling extent from
   the "RESIDENCE DETAILS" table

**Fallback chain:**
1. Primary: DetStructRes page (City's property attribute data)
2. Secondary: Find the subject property in neighbourhood sales data
3. Manual: User enters dwelling extent themselves

**Implementation:** `fetchDwellingFromDetail()` in `lib/scraper.ts`

---

## API Routes

### POST /api/lookup

**Input:** `{ reference: string }`

**Output:** `{ property: Property, salesRows: SaleRow[], detectedDwelling: number | null }`

Calls `lookupProperty()` → `scrapeSales()` → `detectDwellingFromSales()`.
The dwelling extent from the DetStructRes page takes priority over sales data
detection.

### POST /api/analyze

**Input:** `{ property, salesRows, dwellingExtent, filters? }`

**Output:** `AnalysisResult` (see `types.ts`)

Calls `runAnalysis()` which runs the full filtering + dual-method analysis.

---

## Key Design Decisions (for future maintainers / AI agents)

1. **Property reference only (no ERF numbers):** ERF numbers are not unique
   across suburbs. The tool previously accepted them but this caused confusion
   when an ERF matched multiple properties. Users are directed to the City's
   search page to find their property reference.

2. **Median primary, regression supplementary:** See the detailed rationale
   in the Valuation Methodology section above. Do not switch back to
   regression-only without addressing the R² problem.

3. **Time-weighted median over date-filtered median:** Weighting preserves
   sample size (every sale contributes) while still prioritising recent data.
   Discarding old sales would reduce the comparable pool, which is often
   already small.

4. **IQR-based verdict (Q1/Q3) over simple above/below median:** A property
   can be slightly above median and still be "fair" — natural price variation
   means the middle 50% is all defensible. Only flag overvalued when GV2025
   exceeds the 75th percentile.

5. **No external dependencies for the analysis:** The polynomial regression,
   Gaussian elimination, IQR computation, and weighted median are all
   implemented from scratch using only basic math. This avoids dependency
   bloat and keeps the analysis fully transparent.

---

## Development

```bash
npm run dev     # Start dev server at http://localhost:3000
npm run build   # Production build
npm run lint    # ESLint check
```
