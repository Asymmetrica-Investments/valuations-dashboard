"""
main.py — DD-Dash financial extraction microservice.

Run:
    uvicorn main:app --reload --port 8000

Requires:
    Copy .env.example → .env and set MINIMAX_API_KEY before starting.
    pip install -r requirements.txt

Endpoints:
    GET  /                                — liveness probe (kept from initial test)
    GET  /health                          — structured health check
    POST /api/v1/extract-financials       — accepts PDF / Excel, returns JSON
"""

from __future__ import annotations

import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# ─── Upload constraints ────────────────────────────────────────────────────────

MAX_UPLOAD_BYTES: int = 20 * 1024 * 1024  # 20 MB

CONTENT_TYPE_MAP: dict[str, str] = {
    "application/pdf":                                                     "pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":  "excel",
    "application/vnd.ms-excel":                                            "excel",
    "text/csv":                                                            "excel",
    "application/octet-stream":                                            "unknown",
}

EXTENSION_MAP: dict[str, str] = {
    ".pdf":  "pdf",
    ".xlsx": "excel",
    ".xls":  "excel",
    ".csv":  "excel",
}


# ─── Lifespan — warm up the LLM client at startup ─────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("DD-Dash backend starting up…")
    try:
        from services.llm import _get_instructor_client
        _get_instructor_client()
        logger.info("LLM client ready.")
    except Exception as exc:
        logger.warning("LLM client could not be initialised at startup: %s", exc)
    yield
    logger.info("DD-Dash backend shut down.")


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="DD-Dash Extraction API",
    description=(
        "Automated due-diligence financial extraction microservice. "
        "Accepts PDF and Excel investor documents and returns a structured "
        "financial model via the MiniMax LLM."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS ──────────────────────────────────────────────────────────────────────
# allow_origins=["*"] is fine for local development.
# Tighten to your frontend origin(s) before going to production.

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # must be False when allow_origins=["*"]
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
    max_age=600,
)


# ─── Timing middleware ─────────────────────────────────────────────────────────

@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Process-Time-Ms"] = f"{(time.perf_counter() - t0) * 1000:.0f}"
    return response


# ─── Custom error envelope ─────────────────────────────────────────────────────

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"status": exc.status_code, "message": exc.detail}},
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _resolve_file_type(upload: UploadFile) -> str:
    """Return 'pdf' or 'excel'. Raises 415 if the type cannot be determined."""
    ct = (upload.content_type or "").lower().split(";")[0].strip()
    file_type = CONTENT_TYPE_MAP.get(ct)

    if not file_type or file_type == "unknown":
        name = (upload.filename or "").lower()
        for ext, ft in EXTENSION_MAP.items():
            if name.endswith(ext):
                file_type = ft
                break

    if not file_type or file_type == "unknown":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Unsupported file type: content_type='{ct}', "
                f"filename='{upload.filename}'. "
                "Accepted: PDF (.pdf), Excel (.xlsx / .xls), CSV (.csv)."
            ),
        )
    return file_type


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/", tags=["Ops"])
def read_root():
    """Preserved liveness probe."""
    return {"status": "ALIVE!"}


@app.get("/health", tags=["Ops"])
def health_check():
    """Structured health check for load-balancer / k8s probes."""
    return {"status": "ok", "service": "dd-dash-extraction-api", "version": "1.0.0"}


@app.post(
    "/api/v1/extract-financials",
    status_code=status.HTTP_200_OK,
    summary="Extract structured financials from a document",
    tags=["Extraction"],
    responses={
        400: {"description": "Empty file or parse error"},
        413: {"description": "File exceeds 20 MB"},
        415: {"description": "Unsupported file type"},
        422: {"description": "LLM failed to produce valid output after retries"},
        503: {"description": "LLM API unavailable or not configured"},
    },
)
async def extract_financials(
    file: UploadFile = File(..., description="PDF, XLSX, XLS, or CSV — max 20 MB"),
):
    """
    Full extraction pipeline:

    1. Validate file size and resolve type (PDF vs Excel).
    2. Extract raw text via pdfplumber or pandas.
    3. Send text to MiniMax (via Anthropic SDK + instructor).
    4. Return validated ExtractedFinancials JSON.
    """
    # Lazy imports keep startup fast and errors local to this endpoint
    import openai as _openai
    from schemas import ExtractedFinancials
    from services.llm import analyze_financial_text
    from services.parsers import extract_text_from_excel, extract_text_from_pdf

    # ── 1. Read & validate ────────────────────────────────────────────────────
    try:
        file_bytes = await file.read()
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Could not read upload: {exc}") from exc

    if not file_bytes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty.")

    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File is {len(file_bytes) / 1_048_576:.1f} MB — limit is 20 MB.",
        )

    file_type = _resolve_file_type(file)
    logger.info(
        "Upload received — file: '%s' | type: %s | size: %.1f KB",
        file.filename, file_type, len(file_bytes) / 1024,
    )

    # ── 2. Parse document → raw text ─────────────────────────────────────────
    try:
        raw_text = (
            extract_text_from_pdf(file_bytes)
            if file_type == "pdf"
            else extract_text_from_excel(file_bytes)
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Document parsing failed: {exc}") from exc
    except Exception as exc:
        logger.exception("Unexpected parser error — file: '%s'", file.filename)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Unexpected parsing error.") from exc

    # ── 3. LLM extraction ────────────────────────────────────────────────────
    try:
        result: ExtractedFinancials = analyze_financial_text(raw_text)
    except EnvironmentError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except _openai.AuthenticationError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "LLM API auth failed — check MINIMAX_API_KEY.") from exc
    except _openai.APIConnectionError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"LLM API unreachable: {exc}") from exc
    except _openai.RateLimitError as exc:
        raise HTTPException(429, "LLM rate limit hit — retry in a moment.") from exc
    except Exception as exc:
        # Catches instructor.exceptions.InstructorRetryException and anything else
        logger.exception("LLM extraction failed — file: '%s'", file.filename)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Financial extraction failed after retries: {type(exc).__name__}: {exc}",
        ) from exc

    return result


# ─── Dev entrypoint ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
