import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  const backendUrl = `${base}/api/v1/extract-financials`;

  let res: Response;
  try {
    const formData = await req.formData();
    res = await fetch(backendUrl, { method: "POST", body: formData });
  } catch (err) {
    console.error("[process-financials] Network error reaching backend:", err);
    return NextResponse.json(
      { error: "Could not reach the extraction backend." },
      { status: 502 }
    );
  }

  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    console.error(
      `[process-financials] Backend returned ${res.status} ${res.statusText}:`,
      body
    );
    return NextResponse.json(
      { error: `Backend error ${res.status}: ${res.statusText}`, detail: body },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data, { status: 200 });
}
