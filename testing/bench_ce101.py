#!/usr/bin/env python3
"""
Benchmark: Compare model_2.py image extraction vs Gemini ground truth
for all CE-101 (Applied Mechanics) exam papers.
"""
import json, os, sys, shutil, tempfile, time, pathlib

sys.path.insert(0, os.path.dirname(__file__))
from model_2 import extract_images_from_pdf

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google import genai
from google.genai import types
from dotenv import load_dotenv
import io

# ── Config ──
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, 'config.env'))

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
TOKEN_FILE = os.path.join(ROOT, 'google_token.json')
DUMP_FILE = os.path.join(ROOT, 'classroom_dump.json')
BENCH_DIR = os.path.join(os.path.dirname(__file__), 'bench_ce101')

# CE-101 exam papers (from classroom_dump.json)
CE101_PAPERS = [
    ("Paper1.pdf", "1wzyYB1ge-SxQwbl3hStvcJFa0QJOa7sA"),
    ("Paper2.pdf", "1YB3G-t-ebU1b9bLhHUlS4x03zVZeSJyy"),
    ("Paper3.pdf", "1JDIONINHGHRPP3ynrQ3k7OIStie2KVT8"),
    ("Paper4.pdf", "1EZEWfCwLqYN0IBQRzdcIeJ3FBepuEWFT"),
    ("Paper5.pdf", "1P5hOED-DQLCoR01F-QLX8S5OjKI_LONo"),
    ("Paper6.pdf", "1pytuN1v2TVmzRGypWDCOfNlSlna_EEUW"),
    ("Paper7.pdf", "1dYRXrAHVBRCLu9N6FwP8Si5bgN8fRAnc"),
    ("Paper8.pdf", "17dziMjL3JQegVCjHB0GsNl8CQEmwcvY4"),
    ("Paper9.pdf", "1T3E2_VUsjelM1wrsEnfNF_T-8Nsc_eRs"),
    ("Paper10.pdf", "1ykZfdSqHA4R-LJ-ZoQfBdk-bOL9fKqjc"),
    ("Paper11.pdf", "1QWKJTgwjkCboDzOYzzBK98MjbPyNWfAi"),
    ("Mid Sem 2023.pdf", "1d_zo8kB_Yy5lwZ8vtw1wvcqTJneTv1Cu"),
    ("End Sem 2023.pdf", "1vyzGk2RzL5LWdHRZEAzLR0EXWv2Of3LA"),
]


def get_drive_service():
    env = {}
    env_path = os.path.join(ROOT, 'config.env')
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    with open(TOKEN_FILE) as f:
        token_data = json.load(f)
    creds = Credentials(
        token=token_data.get('access_token') or token_data.get('token'),
        refresh_token=token_data.get('refresh_token'),
        token_uri='https://oauth2.googleapis.com/token',
        client_id=env.get('GOOGLE_CLIENT_ID'),
        client_secret=env.get('GOOGLE_CLIENT_SECRET'),
    )
    return build('drive', 'v3', credentials=creds)


def download_pdf(service, file_id, dest_path):
    request = service.files().get_media(fileId=file_id)
    with open(dest_path, 'wb') as fh:
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()


def gemini_count_images(pdf_path):
    """Ask Gemini to count the number of images/diagrams/figures in the PDF."""
    client = genai.Client(api_key=GEMINI_API_KEY)
    pdf_bytes = pathlib.Path(pdf_path).read_bytes()

    count_prompt = """Look at this PDF carefully. Count EVERY distinct image, diagram, figure, graph, or illustration in the document.

Rules:
- Count each visually distinct figure separately.
- Chemical structures count as images.
- If (a), (b), (c) sub-figures are part of ONE question's figure, count them as ONE image.
- Do NOT count text, equations, tables (unless they contain embedded diagrams), or page headers/logos.
- Do NOT count watermarks, page numbers, or decorative elements.

Return ONLY a JSON object: {"image_count": INTEGER, "details": ["brief 5-word description of each image"]}"""

    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-3.1-pro-preview",
                contents=[
                    types.Part.from_bytes(data=pdf_bytes, mime_type='application/pdf'),
                    count_prompt
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.0
                )
            )
            result = json.loads(response.text)
            return result.get('image_count', 0), result.get('details', [])
        except Exception as e:
            print(f"    Gemini attempt {attempt+1} failed: {e}")
            if attempt < 2:
                time.sleep(2 ** attempt)
    return -1, []


def main():
    os.makedirs(BENCH_DIR, exist_ok=True)
    results = []

    print("Connecting to Google Drive...")
    service = get_drive_service()

    for title, drive_id in CE101_PAPERS:
        print(f"\n{'='*60}")
        print(f"  {title}")
        print(f"{'='*60}")

        safe_name = title.replace(' ', '_').replace('/', '_')
        pdf_path = os.path.join(BENCH_DIR, safe_name)
        img_dir = os.path.join(BENCH_DIR, f"imgs_{safe_name.replace('.pdf', '')}")

        # Download
        if not os.path.exists(pdf_path):
            print(f"  Downloading...", end=" ", flush=True)
            try:
                download_pdf(service, drive_id, pdf_path)
                print(f"OK ({os.path.getsize(pdf_path)} bytes)")
            except Exception as e:
                print(f"FAILED: {e}")
                results.append({"title": title, "error": str(e)})
                continue
        else:
            print(f"  Already downloaded ({os.path.getsize(pdf_path)} bytes)")

        # Gemini ground truth
        print(f"  Gemini counting...", end=" ", flush=True)
        gemini_count, gemini_details = gemini_count_images(pdf_path)
        print(f"{gemini_count} images")
        if gemini_details:
            for d in gemini_details:
                print(f"    - {d}")

        # model_2 extraction
        if os.path.exists(img_dir):
            shutil.rmtree(img_dir)
        print(f"  model_2 extracting...")
        try:
            extracted = extract_images_from_pdf(pdf_path, img_dir, debug=True)
            model_count = len(extracted)
        except Exception as e:
            print(f"  model_2 FAILED: {e}")
            model_count = -1

        # Compare
        diff = model_count - gemini_count if (model_count >= 0 and gemini_count >= 0) else None
        match = diff == 0 if diff is not None else False

        status = "MATCH" if match else (f"+{diff}" if diff and diff > 0 else str(diff))
        print(f"\n  RESULT: gemini={gemini_count}  model_2={model_count}  {'✓ MATCH' if match else '✗ ' + status}")

        results.append({
            "title": title,
            "gemini_count": gemini_count,
            "gemini_details": gemini_details,
            "model_count": model_count,
            "diff": diff,
            "match": match,
        })

        # Rate limit for Gemini
        time.sleep(1)

    # ── Summary ──
    print(f"\n\n{'='*60}")
    print(f"  BENCHMARK SUMMARY: CE-101 Applied Mechanics")
    print(f"{'='*60}")

    evaluated = [r for r in results if 'error' not in r and r.get('gemini_count', -1) >= 0]
    errors = [r for r in results if 'error' in r]

    if evaluated:
        matches = sum(1 for r in evaluated if r['match'])
        over = [r for r in evaluated if r.get('diff', 0) and r['diff'] > 0]
        under = [r for r in evaluated if r.get('diff', 0) and r['diff'] < 0]
        diffs = [abs(r['diff']) for r in evaluated if r['diff'] is not None]

        print(f"  Papers tested:    {len(evaluated)}")
        print(f"  Exact matches:    {matches}/{len(evaluated)} ({100*matches/len(evaluated):.0f}%)")
        print(f"  Over-extracted:   {len(over)}")
        print(f"  Under-extracted:  {len(under)}")
        print(f"  Download errors:  {len(errors)}")
        if diffs:
            print(f"  Avg abs error:    {sum(diffs)/len(diffs):.2f}")
            print(f"  Max abs error:    {max(diffs)}")

        print(f"\n  {'Paper':<30s} {'Gemini':>7s} {'Model':>7s} {'Diff':>6s} {'Status':>8s}")
        print(f"  {'-'*30} {'-'*7} {'-'*7} {'-'*6} {'-'*8}")
        for r in evaluated:
            d = r.get('diff', 0) or 0
            sign = f"+{d}" if d > 0 else str(d)
            st = "MATCH" if r['match'] else sign
            print(f"  {r['title']:<30s} {r['gemini_count']:>7d} {r['model_count']:>7d} {sign:>6s} {st:>8s}")
    else:
        print("  No successful evaluations.")

    # Save results
    results_path = os.path.join(BENCH_DIR, 'benchmark_results.json')
    with open(results_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\n  Results saved to: {results_path}")


if __name__ == '__main__':
    main()
