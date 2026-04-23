"""
services/parsers.py — Document text extraction layer.

Responsibilities:
  - Convert raw file bytes into a clean, LLM-readable text string.
  - For PDFs: extract prose text and render tables as pipe-delimited Markdown.
  - For Excel/CSV: read every sheet, stringify data as labelled CSV blocks.

The output format is deliberately verbose and human-readable — the LLM can
handle noise far better than it can handle missing context.
"""

from __future__ import annotations

import io
import logging
from typing import Optional

import pandas as pd
import pdfplumber

logger = logging.getLogger(__name__)


# ─── PDF ──────────────────────────────────────────────────────────────────────

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extract all readable text and tables from a PDF document.

    Strategy:
      1. For each page, pull free-form text first.
      2. Then extract any tables pdfplumber detects and render them as
         pipe-delimited Markdown so the LLM can parse column relationships.
      3. Pages with no useful content are skipped silently.

    Returns a single UTF-8 string ready to be embedded in an LLM prompt.
    Raises ValueError if the PDF is encrypted or completely unreadable.
    """
    chunks: list[str] = []

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            if pdf.metadata.get("Encrypted"):
                raise ValueError(
                    "PDF is password-protected. Please provide an unlocked copy."
                )

            total_pages = len(pdf.pages)
            logger.info("Parsing PDF: %d page(s)", total_pages)

            for page_num, page in enumerate(pdf.pages, start=1):
                page_chunks: list[str] = []

                # ── Free-form text ──────────────────────────────────────────
                raw_text: Optional[str] = page.extract_text(
                    x_tolerance=2,
                    y_tolerance=2,
                    layout=True,          # preserve column spacing
                    x_density=7.25,
                    y_density=13,
                )
                if raw_text and raw_text.strip():
                    page_chunks.append(raw_text.strip())

                # ── Tables → Markdown ───────────────────────────────────────
                tables = page.extract_tables(
                    table_settings={
                        "vertical_strategy":   "lines",
                        "horizontal_strategy": "lines",
                        "snap_tolerance":       3,
                    }
                )

                for table_idx, table in enumerate(tables, start=1):
                    if not table:
                        continue

                    md_rows: list[str] = []
                    for row_idx, row in enumerate(table):
                        # Replace None cells with empty string
                        clean_row = [
                            str(cell).strip().replace("\n", " ") if cell is not None else ""
                            for cell in row
                        ]
                        md_rows.append("| " + " | ".join(clean_row) + " |")

                        # Insert Markdown header separator after the first row
                        if row_idx == 0:
                            separator = "| " + " | ".join("---" for _ in row) + " |"
                            md_rows.append(separator)

                    if md_rows:
                        table_block = (
                            f"\n[Table {table_idx} on page {page_num}]\n"
                            + "\n".join(md_rows)
                        )
                        page_chunks.append(table_block)

                if page_chunks:
                    chunks.append(
                        f"\n\n--- PAGE {page_num} / {total_pages} ---\n"
                        + "\n".join(page_chunks)
                    )

    except pdfplumber.exceptions.PDFSyntaxError as exc:
        raise ValueError(f"PDF is corrupt or not a valid PDF file: {exc}") from exc

    if not chunks:
        raise ValueError(
            "No extractable text found in the PDF. "
            "The file may be a scanned image — OCR is not currently supported."
        )

    result = "\n".join(chunks)
    logger.info("PDF extraction complete: %d characters extracted", len(result))
    return result


# ─── Excel / CSV ──────────────────────────────────────────────────────────────

def extract_text_from_excel(file_bytes: bytes) -> str:
    """
    Extract structured tabular data from an Excel workbook (.xlsx / .xls)
    or a CSV file.

    Strategy:
      1. Attempt to read the bytes as an Excel workbook (all sheets).
      2. Fall back to CSV if the Excel parse fails (handles .csv uploads).
      3. Each sheet is rendered as a labelled CSV block with its sheet name
         as a header — the LLM uses the sheet name as a strong semantic cue
         (e.g., "P&L", "Cash Flow", "Unit Economics").
      4. Numeric formatting is cleaned: trailing .0 removed for integers,
         large numbers kept in full (not abbreviated) for LLM parsing.

    Returns a single UTF-8 string ready to be embedded in an LLM prompt.
    Raises ValueError if the file cannot be parsed at all.
    """
    chunks: list[str] = []

    # ── Try Excel first ─────────────────────────────────────────────────────
    try:
        excel_file = pd.ExcelFile(io.BytesIO(file_bytes), engine="openpyxl")
        sheet_names = excel_file.sheet_names
        logger.info("Parsing Excel workbook: %d sheet(s): %s", len(sheet_names), sheet_names)

        for sheet_name in sheet_names:
            chunk = _sheet_to_text(
                pd.read_excel(
                    excel_file,
                    sheet_name=sheet_name,
                    header=None,      # read all rows; let LLM find the header row
                    dtype=str,        # keep everything as string to avoid float artefacts
                ),
                label=f"Sheet: {sheet_name}",
            )
            if chunk:
                chunks.append(chunk)

    except Exception as excel_err:
        logger.warning(
            "Excel parse failed (%s); retrying as CSV.", excel_err
        )
        # ── Fall back to CSV ─────────────────────────────────────────────────
        try:
            df = pd.read_csv(
                io.BytesIO(file_bytes),
                header=None,
                dtype=str,
                encoding="utf-8",
                on_bad_lines="skip",
            )
            chunk = _sheet_to_text(df, label="CSV data")
            if chunk:
                chunks.append(chunk)
        except Exception as csv_err:
            raise ValueError(
                f"Could not parse file as Excel or CSV.\n"
                f"Excel error: {excel_err}\n"
                f"CSV error:   {csv_err}"
            ) from csv_err

    if not chunks:
        raise ValueError(
            "All sheets in the workbook were empty or contained no usable data."
        )

    result = "\n\n".join(chunks)
    logger.info("Excel/CSV extraction complete: %d characters extracted", len(result))
    return result


def _sheet_to_text(df: pd.DataFrame, label: str) -> str:
    """
    Convert a single DataFrame (one sheet) into a labelled CSV text block.

    - Drops rows and columns that are entirely NaN.
    - Cleans up float-formatted integers (e.g., '1000.0' → '1000').
    - Caps output at 500 rows to avoid bloating the LLM context.
    """
    # Drop fully-empty rows and columns
    df = df.dropna(how="all").dropna(axis=1, how="all")

    if df.empty:
        return ""

    # Cap at 500 rows
    if len(df) > 500:
        logger.warning(
            "Sheet '%s' has %d rows; truncating to 500.", label, len(df)
        )
        df = df.iloc[:500]

    # Clean integer floats: '1234.0' → '1234', keep 'N/A', keep real decimals
    def _clean_cell(val: object) -> str:
        if pd.isna(val):
            return ""
        s = str(val).strip()
        # Remove trailing '.0' only when the whole value is an integer-like float
        if s.endswith(".0") and s[:-2].lstrip("-").isdigit():
            return s[:-2]
        return s

    cleaned = df.map(_clean_cell)  # type: ignore[operator]

    csv_lines = cleaned.to_csv(index=False, header=False).strip()

    return f"[{label}]\n{csv_lines}"
