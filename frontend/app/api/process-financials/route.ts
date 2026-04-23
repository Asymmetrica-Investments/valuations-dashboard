import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const backendUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/extract-financials`;

  const formData = await request.formData();

  const res = await fetch(backendUrl, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();

  return NextResponse.json(data, { status: res.status });
}
