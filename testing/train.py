#!/usr/bin/env python3
"""
Training script: Downloads exam PDFs from classroom_dump.json,
runs image extraction, and collects ground truth from user.
"""

import json
import os
import sys
import shutil
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io

# Add project root to path
sys.path.insert(0, os.path.dirname(__file__))
from hello import extract_images_from_pdf

TRAIN_DIR = os.path.join(os.path.dirname(__file__), "training_data")
RESULTS_FILE = os.path.join(os.path.dirname(__file__), "training_results.json")
TOKEN_FILE = os.path.join(os.path.dirname(__file__), "google_token.json")


def load_env():
    """Load config.env key=value pairs."""
    env = {}
    env_path = os.path.join(os.path.dirname(__file__), "config.env")
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def get_drive_service():
    """Build Drive service from saved OAuth token + config.env credentials."""
    env = load_env()
    with open(TOKEN_FILE) as f:
        token_data = json.load(f)
    creds = Credentials(
        token=token_data.get("access_token") or token_data.get("token"),
        refresh_token=token_data.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=env.get("GOOGLE_CLIENT_ID"),
        client_secret=env.get("GOOGLE_CLIENT_SECRET"),
    )
    return build("drive", "v3", credentials=creds)


def get_exam_pdfs():
    """Extract exam-paper PDFs (Paper/MID SEM/END SEM) from classroom_dump."""
    with open(os.path.join(os.path.dirname(__file__), "classroom_dump.json")) as f:
        data = json.load(f)

    course = data["courses"]["courses"][0]
    materials = course["courseWorkMaterials"]["courseWorkMaterial"]

    pdfs = []
    seen_ids = set()
    for mat in materials:
        for m in mat.get("materials", []):
            if "driveFile" in m:
                df = m["driveFile"]["driveFile"]
                title = df.get("title", "")
                file_id = df.get("id", "")
                if not title.lower().endswith(".pdf") or file_id in seen_ids:
                    continue
                low = title.lower()
                # Only exam papers — these have diagrams/figures
                if any(kw in low for kw in ["paper", "mid sem", "end sem"]):
                    seen_ids.add(file_id)
                    pdfs.append({
                        "title": title,
                        "id": file_id,
                        "topic": mat.get("title", ""),
                    })
    return pdfs


def download_pdf(service, file_id, dest_path):
    """Download a Drive file to dest_path."""
    request = service.files().get_media(fileId=file_id)
    with open(dest_path, "wb") as fh:
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()


def load_results():
    """Load existing training results."""
    if os.path.exists(RESULTS_FILE):
        with open(RESULTS_FILE) as f:
            return json.load(f)
    return {}


def save_results(results):
    """Save training results."""
    with open(RESULTS_FILE, "w") as f:
        json.dump(results, f, indent=2)


def main():
    os.makedirs(TRAIN_DIR, exist_ok=True)
    results = load_results()

    print("Loading exam PDFs from classroom_dump.json...")
    pdfs = get_exam_pdfs()
    print(f"Found {len(pdfs)} exam PDFs (unique by Drive ID)\n")

    # Skip already-evaluated ones
    remaining = [p for p in pdfs if p["id"] not in results]
    print(f"Already evaluated: {len(pdfs) - len(remaining)}")
    print(f"Remaining: {len(remaining)}\n")

    if not remaining:
        print("All PDFs already evaluated! Showing summary.")
        show_summary(results)
        return

    print("Connecting to Google Drive...")
    service = get_drive_service()

    for i, pdf in enumerate(remaining):
        print(f"\n{'='*60}")
        print(f"[{i+1}/{len(remaining)}] {pdf['title']}")
        print(f"  Topic: {pdf['topic']}")
        print(f"  Drive ID: {pdf['id']}")
        print(f"{'='*60}")

        # Download
        safe_name = pdf["title"].replace("/", "_").replace(" ", "_")
        pdf_path = os.path.join(TRAIN_DIR, safe_name)
        img_dir = os.path.join(TRAIN_DIR, f"images_{safe_name.replace('.pdf','')}")

        if not os.path.exists(pdf_path):
            print("  Downloading...", end=" ", flush=True)
            try:
                download_pdf(service, pdf["id"], pdf_path)
                print("OK")
            except Exception as e:
                print(f"FAILED: {e}")
                results[pdf["id"]] = {
                    "title": pdf["title"],
                    "topic": pdf["topic"],
                    "error": str(e),
                }
                save_results(results)
                continue
        else:
            print("  Already downloaded.")

        # Extract images
        if os.path.exists(img_dir):
            shutil.rmtree(img_dir)
        print("  Extracting figures...", end=" ", flush=True)
        try:
            extracted = extract_images_from_pdf(pdf_path, img_dir)
        except Exception as e:
            print(f"FAILED: {e}")
            results[pdf["id"]] = {
                "title": pdf["title"],
                "topic": pdf["topic"],
                "error": str(e),
            }
            save_results(results)
            continue

        count = len(extracted)
        print(f"  → Extracted {count} figures")
        print(f"  → Images saved to: {img_dir}/")

        # Ask user for ground truth
        while True:
            ans = input(f"\n  How many REAL figures in this PDF? (or 's' to skip, 'q' to quit): ").strip()
            if ans.lower() == "s":
                break
            if ans.lower() == "q":
                save_results(results)
                show_summary(results)
                return
            try:
                truth = int(ans)
                results[pdf["id"]] = {
                    "title": pdf["title"],
                    "topic": pdf["topic"],
                    "extracted": count,
                    "ground_truth": truth,
                    "diff": count - truth,
                    "match": count == truth,
                }
                save_results(results)
                if count == truth:
                    print("  ✓ MATCH!")
                elif count > truth:
                    print(f"  ✗ OVER-extracted by {count - truth}")
                else:
                    print(f"  ✗ UNDER-extracted by {truth - count}")
                break
            except ValueError:
                print("  Enter a number, 's' to skip, or 'q' to quit.")

    save_results(results)
    show_summary(results)


def show_summary(results):
    """Print summary of training results."""
    evaluated = {k: v for k, v in results.items() if "ground_truth" in v}
    errors = {k: v for k, v in results.items() if "error" in v}

    if not evaluated:
        print("\nNo evaluations yet.")
        return

    print(f"\n{'='*60}")
    print(f"  TRAINING SUMMARY")
    print(f"{'='*60}")
    
    matches = sum(1 for v in evaluated.values() if v["match"])
    total = len(evaluated)
    over = [v for v in evaluated.values() if v["diff"] > 0]
    under = [v for v in evaluated.values() if v["diff"] < 0]
    
    print(f"  Total evaluated: {total}")
    print(f"  Exact matches:   {matches}/{total} ({100*matches/total:.0f}%)")
    print(f"  Over-extracted:   {len(over)}")
    print(f"  Under-extracted:  {len(under)}")
    print(f"  Download errors:  {len(errors)}")
    
    if over or under:
        print(f"\n  Mismatches:")
        for v in sorted(list(over) + list(under), key=lambda x: abs(x["diff"]), reverse=True):
            sign = "+" if v["diff"] > 0 else ""
            print(f"    {v['title']:45s}  extracted={v['extracted']}  truth={v['ground_truth']}  ({sign}{v['diff']})")
    
    # Stats
    diffs = [abs(v["diff"]) for v in evaluated.values()]
    print(f"\n  Avg absolute error: {sum(diffs)/len(diffs):.2f}")
    print(f"  Max absolute error: {max(diffs)}")


if __name__ == "__main__":
    main()
