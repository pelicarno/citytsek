import { NextRequest, NextResponse } from "next/server";
import { runAnalysis } from "@/lib/analysis";
import { AnalyzeRequest } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json();

    if (!body.property || !body.salesRows || !body.dwellingExtent) {
      return NextResponse.json(
        { error: "Missing required fields: property, salesRows, dwellingExtent." },
        { status: 400 },
      );
    }

    const property = {
      ...body.property,
      dwellingExtent: body.dwellingExtent,
    };

    const result = runAnalysis(body.salesRows, property, body.filters);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
