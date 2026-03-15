#!/usr/bin/env python3
"""Debug which filters kill real figures."""
import fitz, cv2, numpy as np, os, sys

def debug_extract(pdf_path, label):
    doc = fitz.open(pdf_path)
    image_counter = 1
    
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
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
        
        for x, y, w, h in bboxes:
            box_area = w * h
            area_ratio = box_area / page_area
            if w < min_dim or h < min_dim: continue
            if w / h > 5 or h / w > 5: continue
            
            # Check max_area  
            if box_area >= page_area * 0.40:
                print(f"  [{label}] KILLED by max_area=0.40: {w}x{h} area={area_ratio:.2%}")
                continue
            
            cg = gray[y:y+h, x:x+w]
            ce = edges[y:y+h, x:x+w]
            er = cv2.countNonZero(ce) / box_area
            if er < 0.01: continue
            
            _, rb = cv2.threshold(cg, int(otsu), 255, cv2.THRESH_BINARY_INV)
            ic, _ = cv2.findContours(rb, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            ia = sorted([cv2.contourArea(c) for c in ic], reverse=True)
            mi = ia[0] if ia else 0
            cr = mi / box_area
            hs = cr >= 0.005
            bg_ratio = np.sum(cg >= bg_level - 15) / box_area
            
            # F6
            if is_scanned and bg_ratio > 0.80 and (cr < 0.06 or er > 0.035):
                continue
            
            # F2
            if area_ratio < 0.04 and bg_ratio > 0.55 and not hs: continue
            
            # F7 ink blob
            ink = cv2.countNonZero(rb) / box_area
            n_inner = len(ic)
            if ink > 0.85 and n_inner <= 5:
                print(f"  [{label}] KILLED by F7 ink-blob: {w}x{h} ink={ink:.3f} n_inner={n_inner}")
                continue
            
            # F8 char density
            char_sized = sum(1 for a in ia if 50 < a < 3000)
            char_density = char_sized / box_area * 1e6
            if char_sized > 80 and char_density > 200:
                print(f"  [{label}] KILLED by F8 char-density: {w}x{h} chars={char_sized} density={char_density:.1f}")
                continue
            
            # F3 text veto
            sf = 72/300
            rect = fitz.Rect(x*sf, y*sf, (x+w)*sf, (y+h)*sf)
            words = page.get_text("words", clip=rect)
            if words:
                ta = sum(fitz.Rect(wd[:4]).width * fitz.Rect(wd[:4]).height for wd in words)
                if (ta / (sf**2)) / box_area > 0.20:
                    continue
            
            # F4
            if area_ratio < 0.06 and not hs: continue
            
            # F5 row pattern (simplified check)
            hp = np.sum(rb, axis=1) / 255
            ne = hp > 0
            tr = np.diff(ne.astype(int))
            ng = np.sum(tr == -1)
            if ng >= 3:
                bh = []
                in_b = False
                for r in range(len(ne)):
                    if ne[r] and not in_b: start=r; in_b=True
                    elif not ne[r] and in_b: bh.append(r-start); in_b=False
                if in_b: bh.append(len(ne)-start)
                if bh:
                    thm = min(pw,ph)*0.025
                    tl = sum(1 for b in bh if b < thm)
                    if (tl/len(bh)) > 0.70: continue
            
            image_counter += 1
    
    doc.close()
    return image_counter - 1

os.chdir('/home/nirusaki/tiramisu')
for pdf, exp, lbl in [('Paper12.pdf', 3, 'Paper12'), ('Paper1.pdf', 11, 'Paper1')]:
    print(f"\n=== {pdf} (expected {exp}) ===")
    got = debug_extract(pdf, lbl)
    print(f"  Result: {got}/{exp}")
