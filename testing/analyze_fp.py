#!/usr/bin/env python3
"""Analyze false positives from training results."""
import fitz, cv2, numpy as np, os, shutil, json, sys
sys.path.insert(0, os.path.dirname(__file__))
from hello import extract_images_from_pdf

TRAIN = os.path.join(os.path.dirname(__file__), "training_data")

# Problematic PDFs
problems = [
    "MID_SEM_2024-25_(Paper_1).pdf",
    "MID_SEM_2025_(Paper_2).pdf",
    "END_SEM_2023(NEW).pdf",
    "MID_SEM_2024-25_(Paper_4).pdf",
]

# Also find Paper 4 (may have different name)
for f in os.listdir(TRAIN):
    if f.endswith('.pdf') and 'Paper' in f and '4' in f and f not in problems:
        if 'MID' not in f and 'END' not in f:
            problems.append(f)

print("=== Listing training_data PDFs matching Paper.*4 ===")
for f in sorted(os.listdir(TRAIN)):
    if f.endswith('.pdf') and '4' in f.lower() and 'paper' in f.lower():
        print(f"  {f}")

print("\n=== Analyzing false positives ===")
for pdf_name in problems:
    pdf_path = os.path.join(TRAIN, pdf_name)
    if not os.path.exists(pdf_path):
        print(f"\nNOT FOUND: {pdf_name}")
        continue
    
    doc = fitz.open(pdf_path)
    print(f"\n{'='*60}")
    print(f"{pdf_name} ({len(doc)} pages)")
    
    for pg_num in range(len(doc)):
        page = doc.load_page(pg_num)
        pix = page.get_pixmap(dpi=300, alpha=False)
        pw, ph = pix.w, pix.h
        page_area = pw * ph
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(ph, pw, 3)
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        
        is_scanned = len(page.get_text("words")) == 0
        bg_level = int(np.percentile(gray, 85))
        otsu, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        min_dim = int(min(pw, ph) * 0.08)
        
        edges = cv2.Canny(gray, 50, 150)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 30))
        dilated = cv2.dilate(edges, kernel, iterations=1)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        bboxes = sorted([cv2.boundingRect(c) for c in contours], key=lambda b: b[1])
        
        print(f"  Pg{pg_num+1}: {pw}x{ph} scanned={is_scanned} bg={bg_level} otsu={otsu:.0f} min_dim={min_dim}")
        
        # Find boxes that currently pass all filters
        for x, y, w, h in bboxes:
            box_area = w * h
            area_ratio = box_area / page_area
            if w < min_dim or h < min_dim: continue
            if box_area >= page_area * 0.80: continue
            if w / h > 5 or h / w > 5: continue
            
            cg = gray[y:y+h, x:x+w]
            ce = edges[y:y+h, x:x+w]
            edge_ratio = cv2.countNonZero(ce) / box_area
            if edge_ratio < 0.01: continue
            
            _, rb = cv2.threshold(cg, int(otsu), 255, cv2.THRESH_BINARY_INV)
            ic, _ = cv2.findContours(rb, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            ia = sorted([cv2.contourArea(c) for c in ic], reverse=True)
            mi = ia[0] if ia else 0
            cr = mi / box_area
            hs = cr >= 0.005
            
            bg_ratio = np.sum(cg >= bg_level - 15) / box_area
            
            # Filter 6 check
            if is_scanned and bg_ratio > 0.80:
                if cr < 0.06 or edge_ratio > 0.035:
                    continue
            
            # F2
            if area_ratio < 0.04 and bg_ratio > 0.55 and not hs: continue
            # F4
            if area_ratio < 0.06 and not hs: continue
            
            # F5 row pattern
            h_proj = np.sum(rb, axis=1) / 255
            non_empty = h_proj > 0
            transitions = np.diff(non_empty.astype(int))
            num_gaps = np.sum(transitions == -1)
            killed_f5 = False
            if num_gaps >= 3:
                bh = []
                in_b = False
                for r in range(len(non_empty)):
                    if non_empty[r] and not in_b: start = r; in_b = True
                    elif not non_empty[r] and in_b: bh.append(r - start); in_b = False
                if in_b: bh.append(len(non_empty) - start)
                if bh:
                    thm = min(pw, ph) * 0.025
                    tl = sum(1 for b in bh if b < thm)
                    if (tl / len(bh)) > 0.70 and num_gaps >= 3:
                        killed_f5 = True
            if killed_f5: continue
            
            # This box SURVIVED — analyze it
            # Ink ratio
            ink = cv2.countNonZero(rb) / box_area
            # Aspect 
            aspect = max(w/h, h/w)
            # Percentage of page  
            pct_page = area_ratio * 100
            
            # Vertical projection for table detection
            v_proj = np.sum(rb, axis=0) / 255
            v_ne = v_proj > 0
            v_trans = np.diff(v_ne.astype(int))
            v_gaps = np.sum(v_trans == -1)
            
            # Character-sized contour count  
            char_cnt = sum(1 for a in ia if 50 < a < 3000)
            large_cnt = sum(1 for a in ia if a > 3000)
            
            print(f"    PASS: ({x},{y}) {w}x{h} area={area_ratio:.4f}({pct_page:.1f}%) "
                  f"edge={edge_ratio:.3f} cmplx={cr:.4f} bg={bg_ratio:.2f} "
                  f"ink={ink:.3f} gaps_h={num_gaps} gaps_v={v_gaps} "
                  f"chars={char_cnt} large={large_cnt} n_inner={len(ic)}")
    
    doc.close()
