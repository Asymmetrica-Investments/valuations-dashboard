"""
services/llm.py — Structured LLM extraction engine.

Architecture:
  - Uses the OpenAI Python SDK as the HTTP transport layer, pointed at the
    MiniMax API endpoint (which implements the OpenAI-compatible API structure).
  - The `instructor` library patches the client so that `chat.completions.create()`
    accepts a `response_model` parameter and returns a validated Pydantic object
    instead of raw message content.
  - The system prompt is written as a senior PE analyst persona with explicit
    extraction rules, normalisation instructions, and schema awareness.

Why instructor over raw JSON parsing?
  - instructor handles retries on malformed JSON automatically (up to
    MAX_RETRIES attempts).
  - It injects the Pydantic JSON Schema into the tool/function call so the model
    knows the exact structure it must return.
  - Validation errors from Pydantic are fed back to the model with a correction
    prompt, dramatically improving reliability on messy documents.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache

import instructor
from dotenv import load_dotenv
from openai import OpenAI

from schemas import ExtractedFinancials

load_dotenv()

logger = logging.getLogger(__name__)

# ─── Configuration ─────────────────────────────────────────────────────────────

MINIMAX_API_KEY: str = os.environ.get("MINIMAX_API_KEY", "")
MINIMAX_BASE_URL: str = os.environ.get(
    "MINIMAX_BASE_URL", "https://api.minimaxi.chat/v1"
)
MINIMAX_MODEL: str = os.environ.get("MINIMAX_MODEL", "MiniMax-M2.5")
LLM_MAX_TOKENS: int = int(os.environ.get("LLM_MAX_TOKENS", "4096"))

# instructor will automatically retry this many times if the model returns
# output that fails Pydantic validation, sending the error back as a correction.
MAX_RETRIES: int = 3

# Hard cap on the raw text we pass to the model — prevents context overflow.
# MiniMax-Text-01 has a 1M-token context, so 120k chars (~30k tokens) is safe.
MAX_INPUT_CHARS: int = 120_000


# ─── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are an elite Private Equity and Venture Capital financial analyst with 20 years of \
experience conducting due diligence on early-stage and growth companies.

Your task is to extract structured financial data from raw text that has been parsed \
from investor documents — pitch decks, financial models, data room exports, and \
management accounts. The text may be messy, inconsistently formatted, or contain \
artefacts from PDF/Excel extraction.

## Extraction rules

1. **Currency normalisation**: All monetary values must be stored in absolute base units \
   (not thousands or millions). If the document states '$4.2M', store 4200000.0.

2. **Percentage fields**: `gross_margin_pct` must be in the range 0–100 (not 0–1).

3. **Period identification**: Identify each distinct reporting period as a separate \
   FinancialMetrics entry. Mark periods labelled 'F', 'E', 'Est.', 'Budget', \
   'Proj.', or 'Forecast' as is_projected=True.

4. **Chronological order**: Return periods in ascending chronological order.

5. **Derived fields**: If `ltv` and `cac` are both available and `cac > 0`, compute \
   `ltv_to_cac_ratio`. If `cash_balance` and `monthly_burn_rate` are both available \
   and `monthly_burn_rate > 0`, compute `implied_runway_months`.

6. **Monthly burn normalisation**: If only a quarterly or annual cash burn is stated, \
   divide to produce the monthly equivalent and note this in `extraction_warnings`.

7. **Missing fields**: If a metric cannot be found or credibly derived, set it to null. \
   Do NOT fabricate numbers. List unfindable metrics in `missing_metrics`.

8. **Confidence score**: Rate your overall confidence honestly:
   - 0.9–1.0: All 8 core metrics found directly.
   - 0.7–0.89: Most metrics present; minor derivation needed.
   - 0.4–0.69: Significant gaps; heavy inference required.
   - 0.0–0.39: Document is unlikely to be a financial statement.

9. **Warnings**: Add a plain-English note to `extraction_warnings` for every \
   assumption, derivation, currency conversion, or unit adjustment you make.

10. **No commentary**: Return ONLY the structured data. Do not add prose explanations \
    outside the schema fields.
"""


# ─── Client factory ────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _get_instructor_client() -> instructor.Instructor:
    """
    Build and cache the instructor-patched OpenAI client.

    The OpenAI SDK accepts a custom `base_url` which redirects all API calls
    to the MiniMax endpoint while preserving the OpenAI chat completions format.

    instructor patches `client.chat.completions.create` to:
      1. Inject the Pydantic JSON Schema as a tool definition.
      2. Deserialise and validate the model's response against the schema.
      3. Retry with a correction prompt on validation failure (up to MAX_RETRIES).
    """
    if not MINIMAX_API_KEY:
        raise EnvironmentError(
            "MINIMAX_API_KEY environment variable is not set. "
            "Copy .env.example to .env and add your key."
        )

    raw_client = OpenAI(
        api_key=MINIMAX_API_KEY,
        base_url=MINIMAX_BASE_URL,
    )

    patched = instructor.from_openai(raw_client)

    logger.info(
        "Instructor client initialised — model: %s | endpoint: %s",
        MINIMAX_MODEL,
        MINIMAX_BASE_URL,
    )
    return patched


# ─── Main extraction function ──────────────────────────────────────────────────

def analyze_financial_text(raw_text: str) -> ExtractedFinancials:
    """
    Send parsed document text to the MiniMax model via the OpenAI SDK and
    return a fully validated ExtractedFinancials Pydantic object.

    Args:
        raw_text: The clean text/markdown string produced by the parsers.

    Returns:
        ExtractedFinancials: Validated structured extraction result.

    Raises:
        instructor.exceptions.InstructorRetryException: If the model fails to
            produce valid output after MAX_RETRIES attempts.
        openai.APIError: On network or authentication failures.
        EnvironmentError: If MINIMAX_API_KEY is not configured.
    """
    client = _get_instructor_client()

    # Truncate if the document exceeds the safe context window
    if len(raw_text) > MAX_INPUT_CHARS:
        logger.warning(
            "Input text (%d chars) exceeds MAX_INPUT_CHARS (%d); truncating.",
            len(raw_text),
            MAX_INPUT_CHARS,
        )
        raw_text = raw_text[:MAX_INPUT_CHARS] + "\n\n[... document truncated ...]"

    user_message = (
        "Please extract all financial metrics from the following document text.\n\n"
        "Document text:\n"
        "---\n"
        f"{raw_text}\n"
        "---"
    )

    logger.info(
        "Sending extraction request — model: %s | input length: %d chars",
        MINIMAX_MODEL,
        len(raw_text),
    )

    result: ExtractedFinancials = client.chat.completions.create(
        model=MINIMAX_MODEL,
        max_tokens=LLM_MAX_TOKENS,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        response_model=ExtractedFinancials,
        max_retries=MAX_RETRIES,
    )

    logger.info(
        "Extraction complete — company: '%s' | periods: %d | confidence: %.2f",
        result.company_name,
        len(result.metrics),
        result.confidence_score,
    )

    return result
