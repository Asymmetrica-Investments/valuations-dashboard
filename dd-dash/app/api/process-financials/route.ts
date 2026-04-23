import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  UniformInvestorFinancialModelSchema,
  type UniformInvestorFinancialModel,
} from "@/lib/schema";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60; // seconds — file parsing + LLM can be slow

const MODEL = "claude-opus-4-6";

// Pre-build the JSON schema once at module load (cheap, but only runs server-side)
const financialModelJsonSchema = zodToJsonSchema(
  UniformInvestorFinancialModelSchema,
  { name: "UniformInvestorFinancialModel", errorMessages: true }
);

// ---------------------------------------------------------------------------
// File text extraction stubs
// These will be replaced with real parsers (pdf-parse, xlsx, etc.)
// ---------------------------------------------------------------------------

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  // TODO: replace with `import pdfParse from "pdf-parse"` and call
  //       `const result = await pdfParse(Buffer.from(buffer)); return result.text;`
  console.warn("[process-financials] PDF extraction is stubbed — returning placeholder text");
  return "[PDF TEXT EXTRACTION STUB — integrate pdf-parse or similar]";
}

async function extractTextFromExcel(buffer: ArrayBuffer): Promise<string> {
  // TODO: replace with `import * as XLSX from "xlsx"` and convert sheets to
  //       a plain text / CSV representation for the LLM prompt.
  console.warn("[process-financials] Excel extraction is stubbed — returning placeholder text");
  return "[EXCEL TEXT EXTRACTION STUB — integrate xlsx or exceljs]";
}

// ---------------------------------------------------------------------------
// Anthropic extraction call
// ---------------------------------------------------------------------------

async function extractFinancialsWithClaude(
  rawText: string,
  fileName: string,
  fileType: "pdf" | "excel"
): Promise<UniformInvestorFinancialModel> {
  const client = new Anthropic();

  const systemPrompt = `You are a senior financial analyst AI specialising in due diligence for venture capital and private equity.

Your task is to parse raw, unstructured financial text extracted from investor documents and return a strictly structured JSON object.

Rules:
1. Return ONLY a valid JSON object that matches the provided schema — no prose, no markdown fences.
2. Normalise all currency values to the same base unit (e.g. if the document states "USD millions", convert to absolute USD).
3. Distinguish historical actuals from projections/forecasts using the "isProjected" field.
4. If a metric cannot be found or derived, omit its data points and add the metric name to "missingMetrics".
5. If you make assumptions or estimates (e.g. deriving LTV from ARPU), document them in "warnings".
6. Set "extractionConfidence" honestly: high = everything found directly, medium = some estimation needed, low = significant gaps.
7. For "monthlyBurnRate", if only annual/quarterly figures are available, normalise to a monthly equivalent.
8. Compute "ltvToCacRatio" and "runwayMonths" if sufficient data is present.`;

  const userPrompt = `Extract all financial metrics from the following document.

File name: ${fileName}
File type: ${fileType}
Extracted text:
---
${rawText}
---

Return a single JSON object matching this schema exactly:
${JSON.stringify(financialModelJsonSchema, null, 2)}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // Strip any accidental markdown fences before parsing
  const jsonText = content.text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${jsonText.slice(0, 200)}`);
  }

  // Validate against Zod schema — throws ZodError with details if invalid
  return UniformInvestorFinancialModelSchema.parse(parsed);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Request must be multipart/form-data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file uploaded. Send the file as form field 'file'." },
      { status: 400 }
    );
  }

  const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File exceeds 20 MB limit." },
      { status: 413 }
    );
  }

  // Determine file type
  const fileName = file.name.toLowerCase();
  let fileType: "pdf" | "excel";

  if (fileName.endsWith(".pdf")) {
    fileType = "pdf";
  } else if (
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls") ||
    fileName.endsWith(".csv")
  ) {
    fileType = "excel";
  } else {
    return NextResponse.json(
      { error: "Unsupported file type. Upload a PDF, XLSX, XLS, or CSV." },
      { status: 415 }
    );
  }

  // Extract raw text from the file
  const buffer = await file.arrayBuffer();
  let rawText: string;

  try {
    rawText =
      fileType === "pdf"
        ? await extractTextFromPdf(buffer)
        : await extractTextFromExcel(buffer);
  } catch (err) {
    console.error("[process-financials] Text extraction failed:", err);
    return NextResponse.json(
      { error: "Failed to extract text from the uploaded file." },
      { status: 422 }
    );
  }

  // Send to Claude for structured extraction
  let result: UniformInvestorFinancialModel;
  try {
    result = await extractFinancialsWithClaude(rawText, file.name, fileType);
  } catch (err) {
    console.error("[process-financials] Claude extraction failed:", err);
    const message =
      err instanceof Error ? err.message : "Unknown extraction error";
    return NextResponse.json(
      { error: `Financial extraction failed: ${message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(result, { status: 200 });
}
