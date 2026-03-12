import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { lookupProperty, scrapeSales, detectDwellingFromSales } from "@/lib/scraper";
import { LookupResponse } from "@/lib/types";

export const maxDuration = 60;

const cachedLookup = unstable_cache(
  async (reference: string): Promise<LookupResponse> => {
    const { property, dwellingExtent: detailDwelling } = await lookupProperty(reference);
    const salesRows = await scrapeSales(property.parcelid);
    const salesDwelling = detectDwellingFromSales(salesRows, property.parcelid);
    const detectedDwelling = detailDwelling ?? salesDwelling;
    return { property, salesRows, detectedDwelling };
  },
  ["property-lookup"],
  { revalidate: 21600 },
);

export async function POST(request: NextRequest) {
  const startMs = Date.now();
  let ref = "";

  try {
    const { reference } = await request.json();
    ref = typeof reference === "string" ? reference.trim() : "";

    if (!ref) {
      console.log(
        JSON.stringify({
          event: "lookup",
          reference: ref,
          ok: false,
          error: "missing_reference",
          ms: Date.now() - startMs,
        }),
      );
      return NextResponse.json(
        { error: "Property reference is required (e.g. CCT015775300000)." },
        { status: 400 },
      );
    }

    const response = await cachedLookup(ref);

    console.log(
      JSON.stringify({
        event: "lookup",
        reference: ref,
        parcelid: response.property.parcelid,
        address: response.property.address,
        salesCount: response.salesRows.length,
        detectedDwelling: response.detectedDwelling,
        marketValue: response.property.marketValue,
        ok: true,
        ms: Date.now() - startMs,
      }),
    );

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";

    console.log(
      JSON.stringify({
        event: "lookup",
        reference: ref,
        ok: false,
        error: message,
        ms: Date.now() - startMs,
      }),
    );

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
