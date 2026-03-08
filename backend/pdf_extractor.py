"""
PDF Text Extraction Module
Extracts text from PDF files using pdfplumber for accurate text extraction.
Used in compliance mode for document verification workflows.
"""

import io
import pdfplumber


def extract_text_from_pdf(pdf_bytes: bytes) -> dict:
    """Extract text content from a PDF file.
    
    Args:
        pdf_bytes: Raw bytes of the PDF file.
    
    Returns:
        dict with keys:
            - text: Extracted text (concatenated from all pages)
            - pages: Number of pages
            - page_texts: List of text per page
    """
    try:
        pdf_file = io.BytesIO(pdf_bytes)
        page_texts = []

        with pdfplumber.open(pdf_file) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                page_texts.append(page_text.strip())

        full_text = "\n\n".join(t for t in page_texts if t)

        return {
            "text": full_text,
            "pages": len(page_texts),
            "page_texts": page_texts,
        }

    except Exception as e:
        return {
            "error": str(e),
            "text": "",
            "pages": 0,
            "page_texts": [],
        }
