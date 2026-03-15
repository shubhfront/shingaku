import fitz
import os
import cv2
import numpy as np


def extract_images_from_pdf(pdf_path, output_folder):
    """
    Adaptive image extraction for any scanned or digital PDF.
    All thresholds scale relative to page dimensions and detected
    background — no hardcoded pixel values.
    """
    os.makedirs(output_folder, exist_ok=True)
    doc = fitz.open(pdf_path)
    image_counter = 1

    for page_num in range(len(doc)):
        page = doc.load_page(page_num)

        pix = page.get_pixmap(dpi=300, alpha=False)
        pw, ph = pix.w, pix.h
        page_area = pw * ph
        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(ph, pw, 3)
        gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
        img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

        # ── Scanned-page detection ──
        is_scanned_page = len(page.get_text("words")) == 0

        # ── Adaptive background detection ──
        bg_level = int(np.percentile(gray, 85))

        # ── Adaptive binarization (Otsu) ──
        otsu_thresh, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # ── Page-relative size thresholds ──
        min_dim = int(min(pw, ph) * 0.08)          # 8% of shorter side
        max_area_ratio = 0.80                       # reject full-page blobs
        max_aspect = 5.0                            # kill thin lines

        # ── Contour detection ──
        edges = cv2.Canny(gray, 50, 150)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 30))
        dilated = cv2.dilate(edges, kernel, iterations=1)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        bounding_boxes = sorted(
            [cv2.boundingRect(c) for c in contours],
            key=lambda b: b[1]
        )

        f6_killed_regions = []  # collect for sub-extraction pass

        for x, y, w, h in bounding_boxes:
            box_area = w * h

            # ── Gate: size & shape ──
            if w < min_dim or h < min_dim:
                continue
            if box_area >= page_area * max_area_ratio:
                continue
            if w / h > max_aspect or h / w > max_aspect:
                continue

            cropped_gray = gray[y:y+h, x:x+w]
            cropped_edges = edges[y:y+h, x:x+w]

            # ==========================================
            # FILTER 1: BLANK / PHANTOM SHADOW
            # ==========================================
            edge_ratio = cv2.countNonZero(cropped_edges) / box_area
            if edge_ratio < 0.01:
                continue

            # ==========================================
            # EARLY: COMPUTE STRUCTURAL COMPLEXITY
            # ==========================================
            # Needed by multiple filters — compute once, use everywhere.
            _, region_bin = cv2.threshold(
                cropped_gray, int(otsu_thresh), 255, cv2.THRESH_BINARY_INV
            )
            inner_cnts, _ = cv2.findContours(
                region_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            inner_areas = sorted(
                [cv2.contourArea(c) for c in inner_cnts], reverse=True
            )
            max_inner = inner_areas[0] if inner_areas else 0
            complexity_ratio = max_inner / box_area if box_area else 0
            area_ratio = box_area / page_area
            has_structure = complexity_ratio >= 0.005

            # ==========================================
            # FILTER 2: ADAPTIVE WHITESPACE VETO
            # ==========================================
            # Small mostly-background regions WITHOUT significant structure = noise.
            # Regions WITH real diagram shapes get a pass even if background-heavy.
            bg_ratio = np.sum(cropped_gray >= bg_level - 15) / box_area
            if area_ratio < 0.04 and bg_ratio > 0.55 and not has_structure:
                continue

            # ==========================================
            # FILTER 6: SCANNED-PAGE TEXT/NOISE DETECTOR
            # ==========================================
            # On scanned pages (no extractable text), text clusters
            # appear as regions with high background + either low
            # structural complexity or high edge density (many characters).
            # Real figures have clean lines (low edge) with large
            # geometric shapes (high complexity).
            if is_scanned_page and bg_ratio > 0.80:
                if complexity_ratio < 0.10 or edge_ratio > 0.035:
                    f6_killed_regions.append((x, y, w, h))
                    continue

            # ==========================================
            # FILTER 7: INK-BLOB DETECTOR (rough work)
            # ==========================================
            # Student rough work / pen scribbles appear as large
            # solid dark blobs: near-100% ink, very few inner contours.
            ink_ratio = cv2.countNonZero(region_bin) / box_area
            n_inner = len(inner_cnts)
            if ink_ratio > 0.85 and n_inner <= 5:
                continue

            # ==========================================
            # FILTER 8: CHARACTER DENSITY (text block)
            # ==========================================
            # Text regions have many small character-sized contours.
            # Diagrams have fewer, larger geometric shapes.
            char_sized = sum(1 for a in inner_areas if 50 < a < 3000)
            char_density = char_sized / box_area * 1e6  # per million pixels
            if char_sized > 80 and char_density > 200:
                continue

            # ==========================================
            # FILTER 3: TEXT VETO (works on digital PDFs)
            # ==========================================
            scale_factor = 72 / 300
            rect_pts = fitz.Rect(
                x * scale_factor, y * scale_factor,
                (x + w) * scale_factor, (y + h) * scale_factor
            )
            words = page.get_text("words", clip=rect_pts)
            if words:
                text_area = sum(
                    fitz.Rect(wd[:4]).width * fitz.Rect(wd[:4]).height
                    for wd in words
                )
                text_area_px = text_area / (scale_factor ** 2)
                if (text_area_px / box_area) > 0.20:
                    continue

            # ==========================================
            # FILTER 4: STRUCTURAL COMPLEXITY
            # ==========================================
            # Small regions must have at least one structural element.
            if area_ratio < 0.06 and not has_structure:
                continue

            # ==========================================
            # FILTER 5: ROW-PATTERN DETECTOR (scanned text killer)
            # ==========================================
            # Text is arranged in neat horizontal rows.
            # Diagrams have irregular vertical distribution.
            h_proj = np.sum(region_bin, axis=1) / 255
            non_empty = h_proj > 0
            if np.sum(non_empty) > 0:
                # Find runs of empty vs non-empty rows
                transitions = np.diff(non_empty.astype(int))
                num_gaps = np.sum(transitions == -1)  # content→gap transitions
                content_rows = np.sum(non_empty)
                row_usage = content_rows / h

                # Text: many regularly spaced content bands separated by gaps
                # Diagrams: fewer gaps, more continuous content
                # Also check if each "band" is thin (character height)
                if num_gaps >= 3:
                    # Measure average content-band height
                    band_heights = []
                    in_band = False
                    band_start = 0
                    for r_idx in range(len(non_empty)):
                        if non_empty[r_idx] and not in_band:
                            band_start = r_idx
                            in_band = True
                        elif not non_empty[r_idx] and in_band:
                            band_heights.append(r_idx - band_start)
                            in_band = False
                    if in_band:
                        band_heights.append(len(non_empty) - band_start)

                    if band_heights:
                        avg_band = np.mean(band_heights)
                        # At 300 DPI, a text line is ~35-60px tall.
                        # If most bands are text-height AND there are many,
                        # it's a text block, not a diagram.
                        text_height_max = min(pw, ph) * 0.025
                        text_like_bands = sum(
                            1 for bh in band_heights if bh < text_height_max
                        )
                        if (text_like_bands / len(band_heights)) > 0.70 and num_gaps >= 3:
                            continue

            # ══════════════════════════════════════════
            # PASSED ALL FILTERS — extract the diagram 
            # ══════════════════════════════════════════
            pad = 15
            y1 = max(0, y - pad)
            y2 = min(ph, y + h + pad)
            x1 = max(0, x - pad)
            x2 = min(pw, x + w + pad)

            cropped = img_bgr[y1:y2, x1:x2]
            fname = f"figure_{image_counter}.png"
            cv2.imwrite(os.path.join(output_folder, fname), cropped)
            image_counter += 1

        # ══════════════════════════════════════════════════
        # SUB-EXTRACTION: rescue figures from F6-killed regions
        # ══════════════════════════════════════════════════
        # On scanned pages the 30×30 dilation kernel merges nearby
        # figures with surrounding text into one large blob.  F6
        # correctly rejects these mixed blobs, but the figures inside
        # are lost.  Re-process each killed region with a smaller
        # kernel (15×15) to separate individual figures from text.
        if is_scanned_page and f6_killed_regions:
            sub_kernel = cv2.getStructuringElement(
                cv2.MORPH_RECT, (15, 15)
            )
            page_sub_candidates = []
            for rx, ry, rw, rh in f6_killed_regions:
                sub_gray = gray[ry:ry+rh, rx:rx+rw]
                sub_edges = cv2.Canny(sub_gray, 50, 150)
                sub_dilated = cv2.dilate(sub_edges, sub_kernel, iterations=1)
                sub_cnts, _ = cv2.findContours(
                    sub_dilated, cv2.RETR_EXTERNAL,
                    cv2.CHAIN_APPROX_SIMPLE
                )
                parent_area = rw * rh
                min_sub = max(100, int(min(rw, rh) * 0.15))

                for sc in sub_cnts:
                    sx, sy, sw, sh = cv2.boundingRect(sc)
                    sub_area = sw * sh
                    if sw < min_sub or sh < min_sub:
                        continue
                    if sub_area >= parent_area * 0.85:
                        continue
                    if sw / sh > 5.5 or sh / sw > 5.5:
                        continue
                    if sub_area < parent_area * 0.03:
                        continue

                    scg = sub_gray[sy:sy+sh, sx:sx+sw]
                    sce = sub_edges[sy:sy+sh, sx:sx+sw]
                    if cv2.countNonZero(sce) / sub_area < 0.01:
                        continue

                    # Row-pattern filter (text killer)
                    _, sub_bin = cv2.threshold(
                        scg, int(otsu_thresh), 255,
                        cv2.THRESH_BINARY_INV
                    )
                    h_proj = np.sum(sub_bin, axis=1) / 255
                    non_empty = h_proj > 0
                    if np.sum(non_empty) > 0:
                        transitions = np.diff(non_empty.astype(int))
                        num_gaps = np.sum(transitions == -1)
                        if num_gaps >= 3:
                            band_heights = []
                            in_band = False
                            band_start = 0
                            for r_idx in range(len(non_empty)):
                                if non_empty[r_idx] and not in_band:
                                    band_start = r_idx
                                    in_band = True
                                elif not non_empty[r_idx] and in_band:
                                    band_heights.append(r_idx - band_start)
                                    in_band = False
                            if in_band:
                                band_heights.append(len(non_empty) - band_start)
                            if band_heights:
                                text_height_max = min(rw, rh) * 0.03
                                text_like = sum(
                                    1 for bh in band_heights
                                    if bh < text_height_max
                                )
                                if (text_like / len(band_heights)) > 0.70:
                                    continue

                    # Structural quality gates for sub-regions
                    sub_inner_cnts, _ = cv2.findContours(
                        sub_bin, cv2.RETR_EXTERNAL,
                        cv2.CHAIN_APPROX_SIMPLE
                    )
                    sub_inner_areas = sorted(
                        [cv2.contourArea(c) for c in sub_inner_cnts],
                        reverse=True,
                    )
                    sub_max = sub_inner_areas[0] if sub_inner_areas else 0
                    sub_cmplx = sub_max / sub_area if sub_area else 0

                    # Require meaningful structural complexity
                    if sub_cmplx < 0.03:
                        continue

                    # Character-density veto
                    sub_chars = sum(
                        1 for a in sub_inner_areas if 50 < a < 3000
                    )
                    sub_char_d = sub_chars / sub_area * 1e6
                    if sub_chars > 20 and sub_char_d > 200:
                        continue

                    # Passed sub-filters — collect candidate
                    pad = 15
                    abs_y1 = max(0, ry + sy - pad)
                    abs_y2 = min(ph, ry + sy + sh + pad)
                    abs_x1 = max(0, rx + sx - pad)
                    abs_x2 = min(pw, rx + sx + sw + pad)
                    page_sub_candidates.append(
                        (abs_y1, abs_y2, abs_x1, abs_x2)
                    )

            # Minimum-yield filter: only commit if page has ≥3
            # sub-candidates (sparse FPs on text pages get discarded)
            if len(page_sub_candidates) >= 3:
                for abs_y1, abs_y2, abs_x1, abs_x2 in page_sub_candidates:
                    cropped = img_bgr[abs_y1:abs_y2, abs_x1:abs_x2]
                    fname = f"figure_{image_counter}.png"
                    cv2.imwrite(
                        os.path.join(output_folder, fname), cropped
                    )
                    image_counter += 1

    doc.close()
    extracted = [f"figure_{i}.png" for i in range(1, image_counter)]
    print(f"Extraction complete! Found {image_counter - 1} verified figures.")
    return extracted


if __name__ == "__main__":
    a = input("PDF Path: ")
    b = extract_images_from_pdf(a, 'images')
