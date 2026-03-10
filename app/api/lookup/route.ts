import { NextRequest, NextResponse } from "next/server";
import { lookupProperty, scrapeSales, detectDwellingFromSales } from "@/lib/scraper";
import { LookupResponse } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { reference } = await request.json();

    if (!reference || typeof reference !== "string" || reference.trim().length === 0) {
      return NextResponse.json(
        { error: "Property reference is required (e.g. CCT015775300000)." },
        { status: 400 },
      );
    }

    const { property, dwellingExtent: detailDwelling } = await lookupProperty(reference.trim());
    const salesRows = await scrapeSales(property.parcelid);
    const salesDwelling = detectDwellingFromSales(salesRows, property.parcelid);
    const detectedDwelling = detailDwelling ?? salesDwelling;

    const response: LookupResponse = {
      property,
      salesRows,
      detectedDwelling,
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
