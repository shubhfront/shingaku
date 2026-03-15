import fitz, io, os, pathlib, json, base64, time  # PyMuPDF for PDF processing

from google import genai
from google.genai import types
from dotenv import load_dotenv

if os.path.exists('config.env'):
    load_dotenv('config.env')

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')

_prompt_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'prompt.txt')
with open(_prompt_path, 'r') as file:
    prompt = file.read()


# ── Shared helpers ──────────────────────────────────────────────────

PADDING_UNITS = 35  # padding on the 0-1000 normalised scale

def _normalize_bbox(bbox):
    """Validate, reorder, and pad a 0-1000 normalised bounding box.
    Returns (x1, y1, x2, y2) with padding applied and clamped to [0, 1000],
    or None if the bbox is invalid."""
    if not bbox or len(bbox) != 4:
        return None
    try:
        vals = [float(v) for v in bbox]
    except (TypeError, ValueError):
        return None

    x1, y1, x2, y2 = vals

    # Fix swapped coordinates
    if x1 > x2:
        x1, x2 = x2, x1
    if y1 > y2:
        y1, y2 = y2, y1

    # Skip degenerate boxes
    if x2 - x1 < 5 or y2 - y1 < 5:
        return None

    # Add padding
    x1 = max(0, x1 - PADDING_UNITS)
    y1 = max(0, y1 - PADDING_UNITS)
    x2 = min(1000, x2 + PADDING_UNITS)
    y2 = min(1000, y2 + PADDING_UNITS)

    return (x1, y1, x2, y2)


def _bbox_to_clip(bbox_norm, page_width, page_height):
    """Convert normalised 0-1000 bbox tuple to a fitz.Rect in PDF points."""
    x1, y1, x2, y2 = bbox_norm
    return fitz.Rect(
        x1 / 1000 * page_width,
        y1 / 1000 * page_height,
        x2 / 1000 * page_width,
        y2 / 1000 * page_height,
    )


def _adaptive_dpi(clip_rect, base_dpi=300, min_dpi=150, max_dpi=400):
    """Choose DPI based on crop size. Small crops get higher DPI for clarity,
    very large crops get lower DPI to avoid memory blowup."""
    area = clip_rect.width * clip_rect.height
    if area < 5000:        # tiny image
        return max_dpi
    elif area > 200000:    # very large crop (e.g. full page)
        return min_dpi
    return base_dpi


def _get_native_image_rects(page):
    """Extract bounding rects of natively embedded images on a page using PyMuPDF.
    Returns a list of fitz.Rect objects."""
    rects = []
    for img in page.get_images(full=True):
        xref = img[0]
        try:
            img_rects = page.get_image_rects(xref)
            for r in img_rects:
                if r and not r.is_empty and not r.is_infinite:
                    rects.append(r)
        except Exception:
            continue
    return rects


def _rects_overlap(r1, r2, threshold=0.3):
    """Check if two fitz.Rect objects overlap by at least `threshold` of the smaller's area."""
    ix1 = max(r1.x0, r2.x0)
    iy1 = max(r1.y0, r2.y0)
    ix2 = min(r1.x1, r2.x1)
    iy2 = min(r1.y1, r2.y1)
    if ix2 <= ix1 or iy2 <= iy1:
        return False
    inter_area = (ix2 - ix1) * (iy2 - iy1)
    smaller_area = min(r1.width * r1.height, r2.width * r2.height)
    if smaller_area <= 0:
        return False
    return (inter_area / smaller_area) >= threshold


# ── Image extraction (Gemini coordinates + native verification) ─────

def extract_images_from_pdf(pdf_path, output_folder, image_coordinates):
    """Extract images from PDF using Gemini-provided coordinates.

    Improvements over original:
      - Validates & normalizes bounding boxes (swapped coords, degenerate rects)
      - Adds padding around every crop so edges aren't clipped
      - Adaptive DPI (small crops get higher DPI, huge crops get lower)
      - Per-image error handling — one bad crop doesn't kill the rest
      - Hybrid verification: checks if Gemini bbox overlaps a real embedded image;
        if Gemini missed native images, extracts them as bonus figures
    """
    os.makedirs(output_folder, exist_ok=True)
    if not image_coordinates:
        image_coordinates = []

    doc = fitz.open(pdf_path)
    extracted = []
    gemini_rects_per_page = {}  # page_num -> list of fitz.Rect

    # ── Pass 1: extract images at Gemini coordinates ──
    for img_info in image_coordinates:
        filename = img_info.get('filename', '')
        page_num = img_info.get('page', 1) - 1
        raw_bbox = img_info.get('bbox', [])

        if not filename:
            continue
        if page_num < 0 or page_num >= len(doc):
            continue

        bbox_norm = _normalize_bbox(raw_bbox)
        if bbox_norm is None:
            print(f"[img-extract] Skipping {filename}: invalid bbox {raw_bbox}")
            continue

        page = doc[page_num]
        pw, ph = page.rect.width, page.rect.height
        clip = _bbox_to_clip(bbox_norm, pw, ph)
        dpi = _adaptive_dpi(clip)

        # Track for hybrid verification
        if page_num not in gemini_rects_per_page:
            gemini_rects_per_page[page_num] = []
        gemini_rects_per_page[page_num].append(clip)

        try:
            pix = page.get_pixmap(dpi=dpi, clip=clip, alpha=False)
            # Skip extremely tiny results (likely a misdetection)
            if pix.width < 10 or pix.height < 10:
                print(f"[img-extract] Skipping {filename}: pixmap too small ({pix.width}x{pix.height})")
                continue
            pix.save(os.path.join(output_folder, filename))
            extracted.append(filename)
        except Exception as e:
            print(f"[img-extract] Error extracting {filename} from page {page_num+1}: {e}")
            continue

    # ── Pass 2: hybrid fallback — find native images Gemini missed ──
    bonus_counter = len(image_coordinates)
    for page_num in range(len(doc)):
        page = doc[page_num]
        native_rects = _get_native_image_rects(page)
        gemini_rects = gemini_rects_per_page.get(page_num, [])
        pw, ph = page.rect.width, page.rect.height

        for native_rect in native_rects:
            # Skip tiny embedded images (icons, bullets, watermarks)
            if native_rect.width < pw * 0.05 or native_rect.height < ph * 0.05:
                continue

            # Check if any Gemini bbox already covers this native image
            already_covered = any(_rects_overlap(native_rect, gr) for gr in gemini_rects)
            if already_covered:
                continue

            # This is a native image Gemini missed — extract it
            bonus_counter += 1
            bonus_filename = f"figure_{bonus_counter}.png"
            try:
                # Add small padding around native rect
                padded = fitz.Rect(
                    max(0, native_rect.x0 - 5),
                    max(0, native_rect.y0 - 5),
                    min(pw, native_rect.x1 + 5),
                    min(ph, native_rect.y1 + 5),
                )
                dpi = _adaptive_dpi(padded)
                pix = page.get_pixmap(dpi=dpi, clip=padded, alpha=False)
                if pix.width >= 10 and pix.height >= 10:
                    pix.save(os.path.join(output_folder, bonus_filename))
                    extracted.append(bonus_filename)
                    print(f"[img-extract] Bonus: extracted missed native image as {bonus_filename} on page {page_num+1}")
            except Exception as e:
                print(f"[img-extract] Error extracting bonus image on page {page_num+1}: {e}")
                continue

    doc.close()
    return extracted


def extract_kindle_diagrams(pdf_path, kindle_data):
    """Extract diagram blocks from Kindle mode data and replace with base64 data URIs."""
    doc = fitz.open(pdf_path)

    for chapter in kindle_data.get('chapters', []):
        for block in chapter.get('blocks', []):
            if block.get('type') != 'diagram':
                continue

            raw_bbox = block.get('bbox')
            page_num = block.get('page', 1) - 1

            bbox_norm = _normalize_bbox(raw_bbox)
            if bbox_norm is None:
                continue
            if page_num < 0 or page_num >= len(doc):
                continue

            page = doc[page_num]
            pw, ph = page.rect.width, page.rect.height
            clip = _bbox_to_clip(bbox_norm, pw, ph)
            dpi = _adaptive_dpi(clip, base_dpi=200)

            try:
                pix = page.get_pixmap(dpi=dpi, clip=clip, alpha=False)
                if pix.width < 10 or pix.height < 10:
                    continue
                img_bytes = pix.tobytes("png")
                data_uri = "data:image/png;base64," + base64.b64encode(img_bytes).decode()
                block['image'] = data_uri
                block.pop('bbox', None)
            except Exception as e:
                print(f"[kindle-diagram] Error extracting diagram on page {page_num+1}: {e}")
                continue

    doc.close()


# ── Gemini API calls ────────────────────────────────────────────────

def send_pdf_to_gemini(pdf_path, prompt_text, retries=2):
    """Send a PDF to Gemini for structured extraction with retry logic."""
    client = genai.Client(api_key=GEMINI_API_KEY)
    filepath = pathlib.Path(pdf_path)
    pdf_bytes = filepath.read_bytes()

    last_error = None
    for attempt in range(retries + 1):
        try:
            response = client.models.generate_content(
                model="gemini-3.1-pro-preview",
                contents=[
                    types.Part.from_bytes(
                        data=pdf_bytes,
                        mime_type='application/pdf'
                    ),
                    prompt_text
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.0
                )
            )
            text = response.text
            if text and text.strip():
                return text
            raise ValueError("Empty response from Gemini")
        except Exception as e:
            last_error = e
            if attempt < retries:
                wait = 2 ** attempt
                print(f"[gemini] Attempt {attempt+1} failed: {e}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise last_error


def evaluate_answers(exam_data, user_answers, pdf_path=None):
    """Send exam schema + user answers to Gemini for evaluation.
    If pdf_path is provided, the original PDF is sent alongside for accurate answer extraction.
    Returns JSON with per-question evaluation and final score."""
    client = genai.Client(api_key=GEMINI_API_KEY)

    eval_prompt = """You are an expert exam evaluator. I am providing you with:
1. The exam JSON schema (questions, options, correct answers, marking scheme)
2. The student's answers as a JSON object mapping question index to their response

Evaluate each question and return ONLY valid JSON (no markdown, no explanation) with this schema:
{
  "total_score": Float,
  "max_score": Float,
  "percentage": Float,
  "correct_count": Integer,
  "wrong_count": Integer,
  "unattempted_count": Integer,
  "time_taken_seconds": Integer (from input),
  "grade": String ("S" for >=90%, "A" for >=75%, "B" for >=60%, "C" for >=45%, "D" for <45%),
  "rank_title": String (a Bleach anime rank: "Captain Commander" for S, "Captain" for A, "Lieutenant" for B, "Seated Officer" for C, "Academy Student" for D),
  "questions": [
    {
      "id": Integer,
      "topic": String (the specific topic/concept this question tests, e.g. "Thermodynamics", "Quadratic Equations", "Cell Division"),
      "user_answer": Array or String,
      "correct_answer": Array,
      "is_correct": Boolean,
      "marks_awarded": Float,
      "explanation": String (clear explanation of WHY the correct answer is right, 2-3 sentences. Always reveal the full correct answer and reasoning. Use LaTeX math notation with $...$ for inline math and $$...$$ for display math — e.g. "$F = ma$", "$\\frac{a}{b}$", "$x^2$", "$\\sqrt{x}$", "$H_2O$". Wrap ALL mathematical expressions, formulas, chemical formulas, and variables in dollar signs.)
    }
  ],
  "weaknesses": [
    {
      "topic": String (topic name where the student is weak — only include topics with wrong or unattempted answers),
      "wrong_count": Integer (number of wrong answers in this topic),
      "skipped_count": Integer (number of unattempted answers in this topic),
      "total_in_topic": Integer (total questions in this topic),
      "suggestion": String (brief 1-2 sentence tip on what to focus on),
      "youtube_playlists": [
        {
          "title": String (descriptive playlist name, e.g. "Thermodynamics - Khan Academy"),
          "url": String (a YouTube SEARCH URL that finds relevant playlists — use the format: https://www.youtube.com/results?search_query=<topic>+<channel>+playlist — e.g. https://www.youtube.com/results?search_query=thermodynamics+khan+academy+playlist — use well-known channels like Khan Academy, The Organic Chemistry Tutor, Physics Wallah, 3Blue1Brown, Professor Leonard, Unacademy, BYJU'S. NEVER fabricate playlist IDs, ALWAYS use search URLs.)
        }
      ],
      "sources": [
        {
          "title": String (name of the resource, e.g. "Khan Academy - Thermodynamics"),
          "url": String (direct URL to a free learning resource — use real, well-known sites like Khan Academy, BYJU'S, GeeksforGeeks, NCERT, MIT OCW, etc.)
        }
      ]
    }
  ]
}

For subjective questions, evaluate if the student's answer captures the key concepts and award partial/full marks accordingly.
For MCQ/multi_correct/integer, evaluate strictly against the correct answer.
Apply negative marking as specified in the exam schema.
IMPORTANT: You MUST provide the definitive correct_answer for EVERY question — use concrete numerical values, option letters, or exact text. NEVER say "depends" or leave it vague. If the PDF is attached, READ the PDF to verify the correct answers. Always provide a clear explanation (2-3 sentences) for EVERY question (correct, wrong, and unattempted). Always identify the topic per question. Only list topics under "weaknesses" where the student got questions wrong or skipped them. Provide 1-3 real, working learning resource links per weakness topic.
CRITICAL: Every weakness topic MUST include at least 1-2 youtube_playlists — this is COMPULSORY, never skip it. Use YouTube SEARCH URLs in the format https://www.youtube.com/results?search_query=<topic>+<channel>+playlist — NEVER fabricate or guess playlist IDs (playlist?list=...). The youtube_playlists array must NEVER be empty.
"""

    text_content = f"{eval_prompt}\n\nEXAM SCHEMA:\n{json.dumps(exam_data)}\n\nSTUDENT ANSWERS:\n{json.dumps(user_answers)}"

    # Build contents list — include PDF if available for accurate answer verification
    contents = []
    if pdf_path and os.path.exists(pdf_path):
        contents.append(
            types.Part.from_bytes(
                data=pathlib.Path(pdf_path).read_bytes(),
                mime_type='application/pdf'
            )
        )
    contents.append(text_content)

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=contents,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1
        )
    )
    return response.text


def generate_flashcards_from_pdf(pdf_path):
    """Send a PDF to Gemini and get structured flashcard data back as JSON."""
    client = genai.Client(api_key=GEMINI_API_KEY)
    filepath = pathlib.Path(pdf_path)

    flashcard_prompt = """You are an expert educational content creator. I am providing a PDF document containing study material. Your task is to create comprehensive flashcards that cover ALL information in the document.

RULES:
1. Create flashcards for EVERY concept, definition, formula, theorem, fact, and key point in the PDF. Be exhaustive — do not skip any information.
2. Each flashcard has a FRONT (question or prompt) and BACK (answer or explanation).
3. For each card, assign a CATEGORY from exactly one of: "Definition", "Formula", "Theorem", "Key Concept", "Example", "Comparison", "Process", "Fact", "Law", "Diagram".
4. For each card, assign a DIFFICULTY from exactly one of: "easy", "medium", "hard".
5. For each card, assign a COLOR_THEME from exactly one of: "orange", "cyan", "purple", "green", "pink", "blue", "red", "teal". Distribute colors evenly — do not use the same color for every card.
6. For each card, provide a MNEMONIC — a memory aid using one of these types:
   - "emoji_story": A sequence of 3-6 emojis that tell the story of the concept (e.g. "⚡ + 🧲 = 💡" for electromagnetic induction)
   - "acronym": An acronym or first-letter mnemonic (e.g. "VIBGYOR" for light spectrum colors)
   - "analogy": A one-sentence real-world analogy that makes the concept intuitive
   - "rhyme": A short rhyming phrase or sentence to remember the concept
7. CRITICAL — LaTeX math notation is MANDATORY. Every single mathematical expression, variable, formula, equation, chemical formula, or scientific symbol MUST be wrapped in dollar signs. Use $...$ for inline and $$...$$ for display. This applies to the front, back, AND mnemonic.content fields. Examples: "$F = ma$", "$E = mc^2$", "$I_D = I_s(e^{V_D / nV_T} - 1)$", "$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$", "$\\Delta G = \\Delta H - T\\Delta S$", "$H_2O$". Use \\frac{}{} for fractions, _{} for subscripts, ^{} for superscripts, \\sqrt{} for roots. NEVER write plain text math like "F = ma" or "x^2" — ALWAYS wrap in $...$.
8. Include relevant emojis in the front and back text to make them visually engaging and memorable.
9. The BACK of each card must be thorough — include the full explanation, not just a one-word answer. Use \\n for line breaks within the back text.
10. A 10-page PDF should produce at minimum 30-60 flashcards. A 1-page PDF should produce at least 5-10.

Return ONLY valid JSON matching this exact schema:
{
  "source_title": "String — title of the PDF or chapter",
  "total_cards": Integer,
  "flashcards": [
    {
      "id": Integer — sequential starting from 1,
      "category": "Definition|Formula|Theorem|Key Concept|Example|Comparison|Process|Fact|Law|Diagram",
      "difficulty": "easy|medium|hard",
      "color_theme": "orange|cyan|purple|green|pink|blue|red|teal",
      "front": "String — the question or prompt, with emoji",
      "back": "String — the comprehensive answer with emoji, use \\n for line breaks",
      "mnemonic": {
        "type": "emoji_story|acronym|analogy|rhyme",
        "content": "String — the mnemonic content"
      },
      "tags": ["Array", "of", "relevant", "topic", "tags"]
    }
  ]
}"""

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=[
            types.Part.from_bytes(
                data=filepath.read_bytes(),
                mime_type='application/pdf'
            ),
            flashcard_prompt
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.3
        )
    )
    return response.text


def extract_kindle_content(pdf_path):
    """Send a PDF to Gemini and get structured reading content for Kindle mode."""
    client = genai.Client(api_key=GEMINI_API_KEY)
    filepath = pathlib.Path(pdf_path)

    kindle_prompt = """You are an expert document digitizer. I am providing a PDF document. Your task is to extract ALL text content from this PDF and structure it for a clean, readable digital reading experience.

RULES:
1. Extract ALL text content faithfully and completely. Do NOT summarize, paraphrase, or skip any content.
2. Preserve the exact document structure: headings, subheadings, paragraphs, lists, tables, etc.
3. For each content block, classify its type as exactly one of: "heading", "subheading", "paragraph", "list", "table", "formula", "definition", "example", "note", "important", "diagram".
4. CRITICAL — LaTeX math notation is MANDATORY. Every mathematical expression, variable, formula, equation, chemical formula, or scientific symbol MUST be wrapped in dollar signs. Use $...$ for inline and $$...$$ for display/block. This applies to ALL block types — paragraph, list items, definitions, examples, formulas, etc. Examples: "$F = ma$", "$I_D = I_s(e^{V_D / nV_T} - 1)$", "$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$", "$H_2O$". Use \\frac{}{} for fractions, _{} for subscripts, ^{} for superscripts, \\sqrt{} for roots. NEVER write plain text math — ALWAYS wrap in $...$.
5. For "table" type blocks, provide the data as structured rows and columns with headers.
6. For "list" type blocks, provide each list item in the "items" array.
7. For "definition" type blocks, separate the term being defined from its definition text.
8. For "diagram" type blocks, do NOT describe the diagram in text. Instead, provide the bounding box coordinates of the diagram/figure/image on the PDF page. Use normalized coordinates from 0 to 1000 (where 0 = top-left, 1000 = bottom-right). Set the "page" field to the 1-indexed page number and add a "bbox" field as [x1, y1, x2, y2]. The content field should be a short label/caption for the diagram (e.g. "Circuit Diagram", "Phase Diagram", "Block Diagram of CPU"). Add a MARGIN of ~30-50 units on all sides. Example: {"type": "diagram", "content": "RC Circuit", "page": 3, "bbox": [50, 200, 950, 700]}
9. For "important" type blocks, use this for any highlighted, boxed, or emphasized text in the PDF.
10. Preserve the reading order exactly as it appears in the PDF.
11. Group content into logical chapters or sections based on major headings in the PDF. If the PDF has no clear sections, use a single chapter.
12. Use \\n for line breaks within any text content.

Return ONLY valid JSON matching this exact schema:
{
  "title": "String — document title extracted from the PDF",
  "author": "String or null — author if identifiable",
  "total_pages": Integer,
  "estimated_read_time_minutes": Integer,
  "chapters": [
    {
      "title": "String — section or chapter title",
      "page_start": Integer,
      "blocks": [
        {
          "type": "heading|subheading|paragraph|list|table|formula|definition|example|note|important|diagram",
          "content": "String — the text content, used for most types. For diagram type, this is a short caption/label. Use \\n for line breaks.",
          "items": ["Array of strings — ONLY used when type is list"],
          "term": "String — ONLY used when type is definition, the term being defined",
          "definition": "String — ONLY used when type is definition, the definition text",
          "rows": [["2D array of strings — ONLY used when type is table, each inner array is one row"]],
          "headers": ["Array of strings — ONLY used when type is table, column header names"],
          "bbox": [0, 0, 1000, 1000],
          "page": Integer
        }
      ]
    }
  ]
}

CRITICAL: Extract EVERYTHING. Do not summarize or abbreviate. The output must faithfully represent the full, complete content of the PDF."""

    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=[
            types.Part.from_bytes(
                data=filepath.read_bytes(),
                mime_type='application/pdf'
            ),
            kindle_prompt
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1
        )
    )
    return response.text
