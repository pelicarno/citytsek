"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { Property, SaleRow, AnalysisResult, Filters } from "@/lib/types";
import Loader from "@/components/Loader";
import Report from "@/components/Report";

type AppState =
  | { phase: "input" }
  | { phase: "lookup-loading" }
  | {
      phase: "dwelling-prompt";
      property: Property;
      salesRows: SaleRow[];
      detectedDwelling: number | null;
    }
  | {
      phase: "analyze-loading";
      property: Property & { dwellingExtent: number };
      salesRows: SaleRow[];
    }
  | { phase: "results"; property: Property & { dwellingExtent: number }; result: AnalysisResult }
  | { phase: "error"; message: string };

export default function Home() {
  const [state, setState] = useState<AppState>({ phase: "input" });
  const [reference, setReference] = useState("");
  const [dwelling, setDwelling] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minPrice, setMinPrice] = useState("200000");
  const [erfLo, setErfLo] = useState("");
  const [erfHi, setErfHi] = useState("");
  const [dwellingLo, setDwellingLo] = useState("");
  const [dwellingHi, setDwellingHi] = useState("");
  const [iqr, setIqr] = useState("1.5");
  const [freeholdOnly, setFreeholdOnly] = useState(true);
  const didAutoRun = useRef(false);

  useEffect(() => {
    if (didAutoRun.current) return;
    didAutoRun.current = true;

    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    const dw = params.get("dwelling");
    if (!ref || !dw) return;

    const urlFilters: Partial<Filters> = {};
    if (params.get("minPrice")) urlFilters.minPrice = parseFloat(params.get("minPrice")!);
    if (params.get("erfLo") && params.get("erfHi"))
      urlFilters.erfRange = [parseFloat(params.get("erfLo")!), parseFloat(params.get("erfHi")!)];
    if (params.get("dwellingLo") && params.get("dwellingHi"))
      urlFilters.dwellingRange = [
        parseFloat(params.get("dwellingLo")!),
        parseFloat(params.get("dwellingHi")!),
      ];
    if (params.get("iqr")) urlFilters.iqr = parseFloat(params.get("iqr")!);
    if (params.get("freehold")) urlFilters.freeholdOnly = params.get("freehold") === "1";
    const hasFilters = Object.keys(urlFilters).length > 0;

    (async () => {
      setState({ phase: "lookup-loading" });
      try {
        const lookupRes = await fetch("/api/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: ref.trim() }),
        });
        const lookupData = await lookupRes.json();
        if (!lookupRes.ok) {
          setState({ phase: "error", message: lookupData.error || "Lookup failed." });
          return;
        }

        setReference(ref);
        setDwelling(dw);
        if (urlFilters.minPrice) setMinPrice(String(urlFilters.minPrice));
        if (urlFilters.erfRange) {
          setErfLo(String(urlFilters.erfRange[0]));
          setErfHi(String(urlFilters.erfRange[1]));
        }
        if (urlFilters.dwellingRange) {
          setDwellingLo(String(urlFilters.dwellingRange[0]));
          setDwellingHi(String(urlFilters.dwellingRange[1]));
        }
        if (urlFilters.iqr) setIqr(String(urlFilters.iqr));
        if (urlFilters.freeholdOnly !== undefined) setFreeholdOnly(urlFilters.freeholdOnly);

        const dwellingExtent = parseFloat(dw);
        if (!dwellingExtent || dwellingExtent <= 0) {
          setState({
            phase: "dwelling-prompt",
            property: lookupData.property,
            salesRows: lookupData.salesRows,
            detectedDwelling: lookupData.detectedDwelling,
          });
          return;
        }

        const property = { ...lookupData.property, dwellingExtent };
        setState({ phase: "analyze-loading", property, salesRows: lookupData.salesRows });

        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            property,
            salesRows: lookupData.salesRows,
            dwellingExtent,
            filters: hasFilters ? urlFilters : undefined,
          }),
        });
        const analyzeData = await analyzeRes.json();
        if (!analyzeRes.ok) {
          setState({ phase: "error", message: analyzeData.error || "Analysis failed." });
          return;
        }

        setState({ phase: "results", property, result: analyzeData });
      } catch {
        setState({ phase: "error", message: "Network error. Please try again." });
      }
    })();
  }, []);

  useEffect(() => {
    if (state.phase === "results") {
      const url = new URL(window.location.href);
      url.searchParams.set("ref", state.property.parcelid);
      url.searchParams.set("dwelling", String(state.property.dwellingExtent));
      const f = state.result.filters;
      url.searchParams.set("minPrice", String(f.minPrice));
      url.searchParams.set("erfLo", String(f.erfRange[0]));
      url.searchParams.set("erfHi", String(f.erfRange[1]));
      url.searchParams.set("dwellingLo", String(f.dwellingRange[0]));
      url.searchParams.set("dwellingHi", String(f.dwellingRange[1]));
      url.searchParams.set("iqr", String(f.iqr));
      url.searchParams.set("freehold", f.freeholdOnly ? "1" : "0");
      window.history.replaceState({}, "", url.toString());
    }
  }, [state]);

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    if (!reference.trim()) return;

    setState({ phase: "lookup-loading" });

    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: reference.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setState({ phase: "error", message: data.error || "Lookup failed." });
        return;
      }

      setState({
        phase: "dwelling-prompt",
        property: data.property,
        salesRows: data.salesRows,
        detectedDwelling: data.detectedDwelling,
      });

      if (data.detectedDwelling) {
        setDwelling(String(data.detectedDwelling));
      }
    } catch {
      setState({ phase: "error", message: "Network error. Please try again." });
    }
  }

  async function handleAnalyze(e: FormEvent) {
    e.preventDefault();
    if (state.phase !== "dwelling-prompt") return;

    const dwellingExtent = parseFloat(dwelling);
    if (!dwellingExtent || dwellingExtent <= 0) return;

    const property = { ...state.property, dwellingExtent };
    setState({ phase: "analyze-loading", property, salesRows: state.salesRows });

    const filters: Partial<Filters> = {};
    if (minPrice) filters.minPrice = parseFloat(minPrice);
    if (erfLo && erfHi) filters.erfRange = [parseFloat(erfLo), parseFloat(erfHi)];
    if (dwellingLo && dwellingHi)
      filters.dwellingRange = [parseFloat(dwellingLo), parseFloat(dwellingHi)];
    if (iqr) filters.iqr = parseFloat(iqr);
    filters.freeholdOnly = freeholdOnly;

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property,
          salesRows: state.salesRows,
          dwellingExtent,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setState({ phase: "error", message: data.error || "Analysis failed." });
        return;
      }

      setState({ phase: "results", property, result: data });
    } catch {
      setState({ phase: "error", message: "Network error. Please try again." });
    }
  }

  function reset() {
    setState({ phase: "input" });
    setReference("");
    setDwelling("");
    setShowAdvanced(false);
    setErfLo("");
    setErfHi("");
    setDwellingLo("");
    setDwellingHi("");
    window.history.replaceState({}, "", window.location.pathname);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <button onClick={reset} className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              City<span className="text-amber-600 dark:text-amber-400">Tsek</span>
            </span>
          </button>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            GV2025 Valuation Analyser
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Input phase */}
        {state.phase === "input" && (
          <div className="mx-auto max-w-lg">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Check your property valuation
              </h1>
              <p className="mt-2 text-zinc-500 dark:text-zinc-400">
                Enter your property reference to analyse whether the City of Cape Town&apos;s GV2025
                valuation is fair based on comparable sales data.
              </p>
            </div>

            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-950/30">
              <p className="text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-400">
                Important Notices
              </p>
              <ul className="mt-2 space-y-2 text-sm text-red-700 dark:text-red-400">
                <li>
                  <strong>Use at your own risk.</strong> This tool provides a guideline only. It has
                  not yet been used in an actual objection submission, and there is no guarantee
                  that the City will accept its output or change your valuation.
                </li>
                <li>
                  <strong>Sectional titles are not supported.</strong> This tool only works for
                  freehold properties — flats, apartments, and other sectional title units will not
                  produce meaningful results.
                </li>
                <li>
                  This is a <strong>vibe-coded</strong> project — results have not been
                  independently verified and may not be 100% correct.
                </li>
              </ul>
            </div>

            <form onSubmit={handleLookup} className="space-y-4">
              <div>
                <label
                  htmlFor="reference"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Property Reference
                </label>
                <input
                  id="reference"
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. CCT012345600000"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500"
                  autoFocus
                />
                <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                  Letters followed by digits, e.g. CCT012345600000 or SPM001234500000.
                </p>
              </div>

              <button
                type="submit"
                disabled={!reference.trim()}
                className="w-full rounded-lg bg-amber-600 px-4 py-3 font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-600"
              >
                Analyse Property
              </button>
            </form>

            <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/30">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Don&apos;t know your property reference?
              </p>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                You can look it up on the City of Cape Town&apos;s GV2025 site using your ERF number
                or street address:
              </p>
              <a
                href="https://web1.capetown.gov.za/web1/gv2025/SearchProperty"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
              >
                Find your property reference
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>

            <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                How it works
              </p>
              <ol className="mt-2 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                <li>1. Look up your property on the GV2025 Provision Roll</li>
                <li>2. Scrape comparable sales from your neighbourhood</li>
                <li>3. Filter and analyse using polynomial regression</li>
                <li>4. Generate a valuation objection motivation report</li>
              </ol>
            </div>
          </div>
        )}

        {/* Loading: lookup */}
        {state.phase === "lookup-loading" && <Loader phase="lookup" />}

        {/* Dwelling prompt */}
        {state.phase === "dwelling-prompt" && (
          <div className="mx-auto max-w-lg">
            {/* Property found card */}
            <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800/50 dark:bg-green-950/30">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Property found — {state.salesRows.length} comparable sales scraped
              </p>
              <div className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                <p>
                  <strong>{state.property.parcelid}</strong> — {state.property.address}
                </p>
                <p>
                  Erf: {state.property.erfExtent} m² · Valuation: R{" "}
                  {Math.round(state.property.marketValue).toLocaleString()}
                </p>
              </div>
            </div>

            <form onSubmit={handleAnalyze} className="space-y-4">
              <div>
                <label
                  htmlFor="dwelling"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Dwelling Extent (m²)
                  {state.detectedDwelling && (
                    <span className="ml-2 text-xs font-normal text-green-600 dark:text-green-400">
                      Auto-detected from sales data
                    </span>
                  )}
                </label>
                <input
                  id="dwelling"
                  type="number"
                  value={dwelling}
                  onChange={(e) => setDwelling(e.target.value)}
                  placeholder="e.g. 180"
                  min="1"
                  step="any"
                  required
                  className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500"
                  autoFocus={!state.detectedDwelling}
                />
                {!state.detectedDwelling && (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                    Could not auto-detect dwelling size. Please enter it manually (check your rates
                    bill or municipal account).
                  </p>
                )}
              </div>

              {/* Advanced filters toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                <svg
                  className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Advanced Filters
              </button>

              {showAdvanced && (
                <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                        Min Sale Price (R)
                      </label>
                      <input
                        type="number"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                        className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                        IQR Multiplier
                      </label>
                      <input
                        type="number"
                        value={iqr}
                        onChange={(e) => setIqr(e.target.value)}
                        step="0.1"
                        className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                        ERF Range Min (m²)
                      </label>
                      <input
                        type="number"
                        value={erfLo}
                        onChange={(e) => setErfLo(e.target.value)}
                        placeholder="Auto"
                        className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                        ERF Range Max (m²)
                      </label>
                      <input
                        type="number"
                        value={erfHi}
                        onChange={(e) => setErfHi(e.target.value)}
                        placeholder="Auto"
                        className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                        Dwelling Range Min (m²)
                      </label>
                      <input
                        type="number"
                        value={dwellingLo}
                        onChange={(e) => setDwellingLo(e.target.value)}
                        placeholder="Auto"
                        className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                        Dwelling Range Max (m²)
                      </label>
                      <input
                        type="number"
                        value={dwellingHi}
                        onChange={(e) => setDwellingHi(e.target.value)}
                        placeholder="Auto"
                        className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={freeholdOnly}
                      onChange={(e) => setFreeholdOnly(e.target.checked)}
                      className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                    />
                    Freehold properties only
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={!dwelling || parseFloat(dwelling) <= 0}
                className="w-full rounded-lg bg-amber-600 px-4 py-3 font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-600"
              >
                Run Analysis
              </button>

              <button
                type="button"
                onClick={reset}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Start Over
              </button>
            </form>
          </div>
        )}

        {/* Loading: analyze */}
        {state.phase === "analyze-loading" && <Loader phase="analyze" />}

        {/* Results */}
        {state.phase === "results" && (
          <div>
            <button
              onClick={reset}
              className="mb-6 flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
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
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Analyse another property
            </button>
            <Report property={state.property} result={state.result} />
          </div>
        )}

        {/* Error */}
        {state.phase === "error" && (
          <div className="mx-auto max-w-lg">
            <div className="rounded-lg border border-red-200 bg-red-50 p-5 dark:border-red-800/50 dark:bg-red-950/30">
              <p className="font-medium text-red-800 dark:text-red-300">Something went wrong</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-red-700 dark:text-red-400">
                {state.message}
              </p>
            </div>
            <button
              onClick={reset}
              className="mt-4 w-full rounded-lg bg-amber-600 px-4 py-3 font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
            >
              Try Again
            </button>
          </div>
        )}
      </main>

      {/* Donate — only on start and results pages */}
      {(state.phase === "input" || state.phase === "results") && (
        <section className="border-t border-zinc-200 py-4 dark:border-zinc-800">
          <form
            action="https://payment.payfast.io/eng/process"
            method="post"
            target="_blank"
            className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-3 px-4"
          >
            <input type="hidden" name="cmd" value="_paynow" />
            <input type="hidden" name="receiver" value="26316837" />
            <input
              type="hidden"
              name="return_url"
              value="https://citytsek.co.za/payment/thank-you"
            />
            <input type="hidden" name="cancel_url" value="https://citytsek.co.za" />
            <input
              type="hidden"
              name="notify_url"
              value="https://citytsek.co.za/api/payfast/notify"
            />
            <input type="hidden" name="item_name" value="Donate" />

            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Free to use - donate to improve and keep it running
            </span>

            <div className="flex items-center gap-2">
              <label htmlFor="PayFastAmount" className="text-sm text-zinc-500 dark:text-zinc-400">
                R
              </label>
              <input
                required
                id="PayFastAmount"
                type="number"
                step=".01"
                name="amount"
                min="5"
                placeholder="20.00"
                defaultValue="20"
                className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-center text-sm shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-zinc-900"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
              Donate
            </button>
          </form>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-6 dark:border-zinc-800">
        <div className="mx-auto max-w-4xl px-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
          <p>
            Data source: City of Cape Town GV2025 Provision Roll ·{" "}
            <a
              href="https://web1.capetown.gov.za/web1/gv2025/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              web1.capetown.gov.za/web1/gv2025
            </a>
          </p>
          <p className="mt-1">
            This tool provides indicative analysis only. It is not legal or financial advice.
          </p>
          <p className="mt-3">
            <a
              href="https://github.com/pelicarno/citytsek"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 underline hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              GitHub
            </a>
            {" · "}
            Found a bug or have an idea?{" "}
            <a
              href="https://github.com/pelicarno/citytsek/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Open an issue
            </a>
            {" or "}
            <a
              href="https://github.com/pelicarno/citytsek/blob/main/CONTRIBUTING.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              contribute
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
