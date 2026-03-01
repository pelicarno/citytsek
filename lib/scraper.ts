import { Property, SaleRow } from "./types";

const GV_BASE = "https://web1.capetown.gov.za/web1/gv2025";

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function cleanCell(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseResultRows(html: string): Property[] {
  const results: Property[] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const cells: string[] = [];
    let tdMatch;
    tdRegex.lastIndex = 0;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      cells.push(tdMatch[1]);
    }
    if (cells.length < 6) continue;

    const refMatch = cells[0].match(/>(\s*[A-Z]{2,}\d+\s*)</i);
    if (!refMatch) continue;

    const parcelid = refMatch[1].trim().toUpperCase();
    const description = cleanCell(cells[1]);
    const category = cleanCell(cells[2]);
    const address = cleanCell(cells[3]);
    const erfExtent = parseFloat(cleanCell(cells[4])) || 0;

    const valueText = cleanCell(cells[5]);
    const valueMatch = valueText.match(/R\s*([\d,. ]+)/);
    const marketValue = valueMatch
      ? parseFloat(valueMatch[1].replace(/[,\s]/g, ""))
      : 0;

    results.push({ parcelid, description, category, address, erfExtent, marketValue });
  }
  return results;
}

async function fetchDwellingFromDetail(
  resultsHtml: string,
  resultsUrl: string,
  setCookieHeader: string,
): Promise<number | null> {
  const sessionMatch = setCookieHeader.match(/ASP\.NET_SessionId=([^;,\s]+)/);
  if (!sessionMatch) return null;
  const cookieHeader = `ASP.NET_SessionId=${sessionMatch[1]}`;

  const vs = resultsHtml.match(/name="__VIEWSTATE" id="__VIEWSTATE" value="([^"]*)"/)?.[1];
  const vsg = resultsHtml.match(/name="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/)?.[1];
  const ev = resultsHtml.match(/name="__EVENTVALIDATION"[^>]*value="([^"]*)"/)?.[1];
  if (!vs || !vsg || !ev) return null;

  const postbackMatch = resultsHtml.match(/__doPostBack\(&#39;(dgSearch\$ctl\d+\$lbParcelId)&#39;/);
  if (!postbackMatch) return null;

  const body = new URLSearchParams({
    __EVENTTARGET: postbackMatch[1],
    __EVENTARGUMENT: "",
    __VIEWSTATE: vs,
    __VIEWSTATEGENERATOR: vsg,
    __EVENTVALIDATION: ev,
  });

  const postRes = await fetch(resultsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader,
    },
    body: body.toString(),
    redirect: "manual",
  });

  const location = postRes.headers.get("location");
  if (!location || postRes.status !== 302) return null;

  const detailUrl = location.startsWith("http")
    ? location
    : new URL(location, resultsUrl).href;

  const detailRes = await fetch(detailUrl, {
    headers: { Cookie: cookieHeader },
  });
  if (!detailRes.ok) return null;

  const detailHtml = await detailRes.text();
  const dwellingMatch = detailHtml.match(
    /Dwelling Extent<\/font><\/td><td><font[^>]*>([\d.]+)<\/font>/i,
  );
  return dwellingMatch ? parseFloat(dwellingMatch[1]) : null;
}

export async function lookupProperty(
  reference: string,
): Promise<{ property: Property; searchType: string; dwellingExtent: number | null }> {
  const trimmed = reference.trim().toUpperCase();

  if (/^\d+$/.test(trimmed)) {
    throw new Error(
      `ERF numbers are not accepted because they can match multiple properties across suburbs. ` +
      `Please use your property reference (e.g. CCT015775300000) instead.\n\n` +
      `To find your property reference, visit:\nhttps://web1.capetown.gov.za/web1/gv2025/SearchProperty\n` +
      `and search by ERF number or address.`
    );
  }

  if (!/^[a-zA-Z]{2,}\d+$/i.test(trimmed)) {
    throw new Error(
      `"${reference.trim()}" does not look like a valid property reference. ` +
      `Property references start with letters followed by digits (e.g. CCT015775300000).\n\n` +
      `To find your property reference, visit:\nhttps://web1.capetown.gov.za/web1/gv2025/SearchProperty`
    );
  }

  const url = `${GV_BASE}/Results?Search=VAL,${trimmed}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching results for "${trimmed}".`);
  const html = await res.text();
  const results = parseResultRows(html);

  if (results.length === 0) {
    throw new Error(
      `No property found for reference "${trimmed}". Check the input and try again.`
    );
  }

  let dwellingExtent: number | null = null;
  try {
    const setCookie = res.headers.get("set-cookie") || "";
    dwellingExtent = await fetchDwellingFromDetail(html, url, setCookie);
  } catch {
    // Detail page unavailable; fall back to sales data detection
  }

  return { property: results[0], searchType: "VAL", dwellingExtent };
}

function parseSalesRows(html: string): string[][] {
  const rows: string[][] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const cells: string[] = [];
    let tdMatch;
    tdRegex.lastIndex = 0;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      cells.push(cleanCell(tdMatch[1]));
    }
    if (cells.length >= 7 && /^[A-Z]{2,}\d/i.test(cells[0])) {
      rows.push(cells.slice(0, 7));
    }
  }
  return rows;
}

function findNextPageUrl(html: string, currentUrl: string): string | null {
  const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>\s*(Next|&gt;|›|»|\d+)\s*<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1].replace(/&amp;/g, "&");
    if (/page=/i.test(href)) {
      return href.startsWith("http") ? href : new URL(href, currentUrl).href;
    }
  }
  return null;
}

export async function scrapeSales(parcelid: string): Promise<SaleRow[]> {
  const salesUrl = `${GV_BASE}/Sales?parcelid=${parcelid.toLowerCase()}`;
  const allRows: string[][] = [];
  let url: string | null = salesUrl;
  let page = 1;

  while (url) {
    const html = await fetchPage(url);
    const rows = parseSalesRows(html);
    allRows.push(...rows);

    const next = findNextPageUrl(html, url);
    if (next && next !== url) {
      url = next;
      page++;
    } else {
      url = null;
    }
  }

  return allRows.map((cols) => ({
    ref: cols[0],
    address: cols[1],
    description: cols[2],
    erfExtent: cols[3],
    dwellingExtent: cols[4],
    saleDate: cols[5],
    salePrice: cols[6],
  }));
}

export function detectDwellingFromSales(salesRows: SaleRow[], parcelid: string): number | null {
  const match = salesRows.find(
    (s) => s.ref.toUpperCase() === parcelid.toUpperCase() && parseFloat(s.dwellingExtent) > 0
  );
  return match ? parseFloat(match.dwellingExtent) : null;
}
