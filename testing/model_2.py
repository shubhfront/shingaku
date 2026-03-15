import fitz
import os
import cv2
import numpy as np


def extract_images_from_pdf(pdf_path, output_folder, debug=True):
  
    os.makedirs(output_folder, exist_ok=True)
    doc = fitz.open(pdf_path)
    image_counter = 1

    for page_num in range(len(doc)):
        page = doc.load_page(page_num)

        native_images = page.get_images(full=True)
        text_words = page.get_text("words")
        is_scanned = len(text_words) == 0

        # Skip text-only digital pages (no images, lots of text)
        if not is_scanned and len(native_images) == 0 and len(text_words) > 50:
            if debug:
                print(f"  [pg{page_num+1}] SKIP: text-only ({len(text_words)} words, 0 native images)")
            continue

        # Render page
        pix = page.get_pixmap(dpi=300, alpha=False)
        pw, ph = pix.w, pix.h
        page_area = pw * ph
        img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(ph, pw, 3)
        gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
        img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

        # Adaptive thresholds
        bg_level = int(np.percentile(gray, 85))
        otsu_thresh, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        # Scale min_dim based on resolution — higher DPI scans need larger minimums
        short_side = min(pw, ph)
        min_dim = int(short_side * 0.06)
        max_area_ratio = 0.75
        max_aspect = 4.5
        edges = cv2.Canny(gray, 50, 150)
        bounding_boxes = _multi_pass_contours(edges, pw, ph, page_area, debug)

        if debug:
            print(f"  [pg{page_num+1}] {pw}x{ph} | {len(bounding_boxes)} contours | {len(native_images)} native imgs | scanned={is_scanned}")

        native_rects = []
        for img_info in native_images:
            xref = img_info[0]
            try:
                for r in page.get_image_rects(xref):
                    if r and not r.is_empty and not r.is_infinite:
                        scale = 300 / 72
                        nw = int(r.width * scale)
                        nh = int(r.height * scale)
                        nr_area = nw * nh
                        if nr_area >= page_area * 0.60:
                            continue 
                        native_rects.append((
                            int(r.x0 * scale), int(r.y0 * scale), nw, nh
                        ))
            except Exception:
                continue

        accepted = []
        killed_text = []

        for x, y, w, h in bounding_boxes:
            verdict, reason = _classify(
                x, y, w, h, gray, edges, page, pw, ph, page_area,
                min_dim, max_area_ratio, max_aspect,
                bg_level, otsu_thresh, is_scanned, native_rects
            )
            if debug:
                area_pct = (w * h) / page_area * 100
                if verdict == 'accept_multi':
                    print(f"    ({x},{y}) {w}x{h} [{area_pct:.1f}%] → accept (native_match x{len(reason)})")
                else:
                    print(f"    ({x},{y}) {w}x{h} [{area_pct:.1f}%] → {verdict} ({reason})")

            if verdict == 'accept':
                accepted.append((x, y, w, h))
            elif verdict == 'accept_multi':
            
                for nx, ny, nw, nh in reason:
                    accepted.append((nx, ny, nw, nh))
            elif verdict == 'killed_text':
                killed_text.append((x, y, w, h))

        
        rescued = _sub_extract(killed_text, gray, edges, otsu_thresh, pw, ph, debug)
        accepted.extend(rescued)

        accepted = _merge_within_native(accepted, native_rects, debug)


        before_nms = len(accepted)
        accepted = _suppress_overlaps(accepted)
        if debug and before_nms != len(accepted):
            print(f"    NMS: {before_nms} → {len(accepted)} boxes")

        # Save
        for bx, by, bw, bh in accepted:
            image_counter = _save_crop(img_bgr, bx, by, bw, bh, pw, ph, output_folder, image_counter)

    doc.close()
    count = image_counter - 1
    print(f"\nExtraction complete! Found {count} figure(s).")
    return [f"figure_{i}.png" for i in range(1, image_counter)]


def _segment_by_gaps(edge_img, w, h, min_gap=50):
    
    h_proj = np.sum(edge_img, axis=1) / 255 if edge_img.dtype == np.uint8 else np.sum(edge_img, axis=1)
    threshold = w * 0.02  #2%

    # Find gap regions
    is_empty = h_proj < threshold
    segments = []
    in_content = False
    content_start = 0

    for i in range(h):
        if not is_empty[i] and not in_content:
            content_start = i
            in_content = True
        elif is_empty[i] and in_content:
            segments.append((content_start, i))
            in_content = False

    if in_content:
        segments.append((content_start, h))

    # Merge segments separated by gaps smaller than min_gap
    merged = []
    for seg in segments:
        if merged and (seg[0] - merged[-1][1]) < min_gap:
            merged[-1] = (merged[-1][0], seg[1])
        else:
            merged.append(list(seg))

    return [(s, e) for s, e in merged]


def _multi_pass_contours(edges, pw, ph, page_area, debug=False):
  #30x30 20x20 merge
    kernel_large = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 30))
    dilated = cv2.dilate(edges, kernel_large, iterations=1)
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    raw_boxes = [cv2.boundingRect(c) for c in contours]

    final_boxes = []
    needs_repass = []

    for (x, y, w, h) in raw_boxes:
        if (w * h) >= page_area * 0.50:
            needs_repass.append((x, y, w, h))
        else:
            final_boxes.append((x, y, w, h))

    # small krnel mrging
    for kernel_size in [20, 10]:
        if not needs_repass:
            break
        kernel_small = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
        still_too_big = []
        for (rx, ry, rw, rh) in needs_repass:
            sub_edges = edges[ry:ry+rh, rx:rx+rw]
            sub_dilated = cv2.dilate(sub_edges, kernel_small, iterations=1)
            sub_cnts, _ = cv2.findContours(sub_dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for sc in sub_cnts:
                sx, sy, sw, sh = cv2.boundingRect(sc)
                abs_box = (rx + sx, ry + sy, sw, sh)
                if (sw * sh) >= page_area * 0.50:
                    still_too_big.append(abs_box)
                else:
                    final_boxes.append(abs_box)
            if debug:
                print(f"    REPASS({kernel_size}x{kernel_size}): split {rw}x{rh} blob into {len(sub_cnts)} sub-contours")
        needs_repass = still_too_big
    # into question blocks.
    for (rx, ry, rw, rh) in needs_repass:
        sub_edges = edges[ry:ry+rh, rx:rx+rw]
        segments = _segment_by_gaps(sub_edges, rw, rh, min_gap=int(min(pw, ph) * 0.02))
        for sy_start, sy_end in segments:
            sh = sy_end - sy_start
            if sh > 0:
                final_boxes.append((rx, ry + sy_start, rw, sh))
        if debug:
            print(f"    GAP-SPLIT: {rw}x{rh} blob into {len(segments)} segments")
    return sorted(final_boxes, key=lambda b: b[1])


def _classify(x, y, w, h, gray, edges, page, pw, ph, page_area,
              min_dim, max_area_ratio, max_aspect,
              bg_level, otsu_thresh, is_scanned, native_rects):
    """Returns (verdict, reason) tuple."""
    box_area = w * h
    area_ratio = box_area / page_area

    # Size & shape gates
    if w < min_dim or h < min_dim:
        return 'reject', 'too_small'
    if box_area >= page_area * max_area_ratio:
        return 'reject', 'too_large'
    aspect = max(w / h, h / w)
    if aspect > max_aspect:
        # Wide/tall blobs are often figure+text merged on scanned pages.
        # Send to killed_text for sub-extraction instead of hard reject.
        # Only hard-reject extremely elongated shapes (> 8:1) on digital PDFs.
        if aspect > 8 and not is_scanned:
            return 'reject', 'bad_aspect'
        return 'killed_text', 'bad_aspect'

    # Native image boost — auto-accept if overlaps a real embedded image.
    # Check EARLY (before text filters) because native rects are reliable
    # ground truth that should override heuristic text detection.
    # If the box overlaps MULTIPLE native rects, split into separate accepts.
    matching_natives = []
    for nx, ny, nw, nh in native_rects:
        cx, cy = x + w // 2, y + h // 2
        ncx, ncy = nx + nw // 2, ny + nh // 2
        if abs(cx - ncx) < max(w, nw) * 0.6 and abs(cy - ncy) < max(h, nh) * 0.6:
            matching_natives.append((nx, ny, nw, nh))
    if len(matching_natives) == 1:
        return 'accept', 'native_match'
    elif len(matching_natives) > 1:
        # Signal: multiple native images overlap this box — needs splitting
        return 'accept_multi', matching_natives

    crop_gray = gray[y:y+h, x:x+w]
    crop_edges = edges[y:y+h, x:x+w]

    # F1: blank region
    edge_ratio = cv2.countNonZero(crop_edges) / box_area
    if edge_ratio < 0.008:
        return 'reject', 'blank'

    # Structural analysis
    _, region_bin = cv2.threshold(crop_gray, int(otsu_thresh), 255, cv2.THRESH_BINARY_INV)
    inner_cnts, _ = cv2.findContours(region_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    inner_areas = sorted([cv2.contourArea(c) for c in inner_cnts], reverse=True)
    max_inner = inner_areas[0] if inner_areas else 0
    complexity = max_inner / box_area if box_area else 0
    has_structure = complexity >= 0.005

    # F2: whitespace
    bg_ratio = np.sum(crop_gray >= bg_level - 15) / box_area
    if area_ratio < 0.04 and bg_ratio > 0.55 and not has_structure:
        return 'reject', 'whitespace'

    # F3: ink blob
    ink_ratio = cv2.countNonZero(region_bin) / box_area
    if ink_ratio > 0.85 and len(inner_cnts) <= 5:
        return 'reject', 'ink_blob'

    # F4: character density
    char_sized = sum(1 for a in inner_areas if 50 < a < 3000)
    char_density = char_sized / box_area * 1e6
    if char_sized > 80 and char_density > 200:
        return 'killed_text', 'char_density'

    # F5: PyMuPDF text ratio (digital PDFs only)
    if not is_scanned:
        scale = 72 / 300
        rect_pts = fitz.Rect(x * scale, y * scale, (x + w) * scale, (y + h) * scale)
        words = page.get_text("words", clip=rect_pts)
        if words:
            text_area = sum(fitz.Rect(wd[:4]).width * fitz.Rect(wd[:4]).height for wd in words)
            text_ratio = (text_area / (scale ** 2)) / box_area
            if text_ratio > 0.25:
                return 'killed_text', f'text_ratio={text_ratio:.2f}'

    # F6: row-pattern
    if _is_text_rows(region_bin, min(pw, ph)):
        return 'killed_text', 'row_pattern'

    # F7: scanned page — only kill if BOTH complexity is very low AND
    # it looks like text (many character-sized contours).
    # has_structure (complexity >= 0.005) is a signal of real content, so
    # we skip this filter for structured regions even on scanned pages.
    if is_scanned and bg_ratio > 0.85 and not has_structure:
        if complexity < 0.01 and char_sized > 20:
            return 'killed_text', 'scanned_text'

    # F8: small + no structure
    if area_ratio < 0.06 and not has_structure:
        return 'reject', 'small_no_structure'

    return 'accept', 'survived_all'


def _sub_extract(killed_blobs, gray, edges, otsu_thresh, pw, ph, debug):
    """Rescue real figures from blobs that were killed as text."""
    if not killed_blobs:
        return []

    rescued = []
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (12, 12))
    page_area = pw * ph
    # Minimum sub-region size: at least 3% of shorter page dimension
    global_min_sub = int(min(pw, ph) * 0.03)

    for rx, ry, rw, rh in killed_blobs:
        sub_gray = gray[ry:ry+rh, rx:rx+rw]
        sub_edges = cv2.Canny(sub_gray, 50, 150)
        sub_dilated = cv2.dilate(sub_edges, kernel, iterations=1)
        sub_cnts, _ = cv2.findContours(sub_dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        parent_area = rw * rh
        min_sub = max(global_min_sub, int(min(rw, rh) * 0.15))

        for sc in sub_cnts:
            sx, sy, sw, sh = cv2.boundingRect(sc)
            sub_area = sw * sh

            if sw < min_sub or sh < min_sub:
                continue
            if sub_area >= parent_area * 0.90 or sub_area < parent_area * 0.02:
                continue
            # Must be at least 0.5% of the page to be a real figure
            if sub_area < page_area * 0.005:
                continue
            if sw / sh > 5 or sh / sw > 5:
                continue

            sub_crop_edges = sub_edges[sy:sy+sh, sx:sx+sw]
            if cv2.countNonZero(sub_crop_edges) / sub_area < 0.01:
                continue

            sub_crop_gray = sub_gray[sy:sy+sh, sx:sx+sw]
            _, sub_bin = cv2.threshold(sub_crop_gray, int(otsu_thresh), 255, cv2.THRESH_BINARY_INV)
            sub_inner, _ = cv2.findContours(sub_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            sub_inner_areas = sorted([cv2.contourArea(c) for c in sub_inner], reverse=True)
            sub_max = sub_inner_areas[0] if sub_inner_areas else 0
            sub_complexity = sub_max / sub_area if sub_area else 0

            if sub_complexity < 0.015:
                continue

            char_sized = sum(1 for a in sub_inner_areas if 50 < a < 3000)
            if char_sized > 40 and (char_sized / sub_area * 1e6) > 250:
                continue

            if _is_text_rows(sub_bin, min(rw, rh)):
                continue

            abs_x, abs_y = rx + sx, ry + sy
            rescued.append((abs_x, abs_y, sw, sh))
            if debug:
                print(f"    SUB-RESCUE from killed ({rx},{ry}): ({abs_x},{abs_y}) {sw}x{sh}")

    return rescued


def _merge_within_native(boxes, native_rects, debug=False):
    """If multiple accepted boxes fall inside the same native image rect,
    merge them into one bounding box (the union).

    This catches the case where a single real figure gets split into
    multiple contours, each matching the same native image xref.
    """
    if not native_rects or len(boxes) <= 1:
        return boxes

    # For each native rect, find which accepted boxes overlap it
    # (>= 40% of the box's area is inside the native rect)
    groups = {}  # native_rect_index -> list of box indices
    ungrouped = set(range(len(boxes)))

    for ni, (nx, ny, nw, nh) in enumerate(native_rects):
        for bi, (bx, by, bw, bh) in enumerate(boxes):
            # Intersection of box with native rect
            ix1 = max(bx, nx)
            iy1 = max(by, ny)
            ix2 = min(bx + bw, nx + nw)
            iy2 = min(by + bh, ny + nh)
            if ix2 <= ix1 or iy2 <= iy1:
                continue
            inter = (ix2 - ix1) * (iy2 - iy1)
            box_area = bw * bh
            if box_area > 0 and (inter / box_area) >= 0.40:
                if ni not in groups:
                    groups[ni] = []
                groups[ni].append(bi)
                ungrouped.discard(bi)

    result = []

    # For each native rect group, merge all boxes into one union box
    for ni, bi_list in groups.items():
        if len(bi_list) == 1:
            result.append(boxes[bi_list[0]])
        else:
            # Union of all boxes in this group
            min_x = min(boxes[bi][0] for bi in bi_list)
            min_y = min(boxes[bi][1] for bi in bi_list)
            max_x = max(boxes[bi][0] + boxes[bi][2] for bi in bi_list)
            max_y = max(boxes[bi][1] + boxes[bi][3] for bi in bi_list)
            merged = (min_x, min_y, max_x - min_x, max_y - min_y)
            if debug:
                print(f"    MERGE: {len(bi_list)} boxes inside native rect #{ni} → ({min_x},{min_y}) {max_x-min_x}x{max_y-min_y}")
            result.append(merged)

    # Add ungrouped boxes unchanged
    for bi in sorted(ungrouped):
        result.append(boxes[bi])

    return result


def _proximity_merge(boxes, pw, ph, debug=False):
    """Merge boxes that are very close together into one union box.

    Only merges boxes whose edges are within 2% of the shorter page dimension.
    This catches figure fragments on high-res scans without merging
    legitimately separate adjacent figures.
    """
    if len(boxes) <= 1:
        return boxes

    gap_thresh = min(pw, ph) * 0.02

    n = len(boxes)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    for i in range(n):
        x1, y1, w1, h1 = boxes[i]
        for j in range(i + 1, n):
            x2, y2, w2, h2 = boxes[j]
            gx = max(0, max(x1, x2) - min(x1 + w1, x2 + w2))
            gy = max(0, max(y1, y2) - min(y1 + h1, y2 + h2))
            if gx < gap_thresh and gy < gap_thresh:
                union(i, j)

    groups = {}
    for i in range(n):
        r = find(i)
        if r not in groups:
            groups[r] = []
        groups[r].append(i)

    result = []
    for indices in groups.values():
        if len(indices) == 1:
            result.append(boxes[indices[0]])
        else:
            min_x = min(boxes[i][0] for i in indices)
            min_y = min(boxes[i][1] for i in indices)
            max_x = max(boxes[i][0] + boxes[i][2] for i in indices)
            max_y = max(boxes[i][1] + boxes[i][3] for i in indices)
            merged = (min_x, min_y, max_x - min_x, max_y - min_y)
            if debug:
                print(f"    PROX-MERGE: {len(indices)} boxes → ({min_x},{min_y}) {max_x-min_x}x{max_y-min_y}")
            result.append(merged)

    return result


def _suppress_overlaps(boxes):
    """NMS: if a smaller box's intersection with a larger box covers >= 50%
    of the smaller box's area, drop the smaller one."""
    if len(boxes) <= 1:
        return boxes

    # Sort largest first
    boxes = sorted(boxes, key=lambda b: b[2] * b[3], reverse=True)
    keep = []

    for (x, y, w, h) in boxes:
        a = w * h
        suppressed = False

        for (kx, ky, kw, kh) in keep:
            # Intersection
            ix1 = max(x, kx)
            iy1 = max(y, ky)
            ix2 = min(x + w, kx + kw)
            iy2 = min(y + h, ky + kh)

            if ix2 <= ix1 or iy2 <= iy1:
                continue

            inter = (ix2 - ix1) * (iy2 - iy1)

            # Check if current box (the smaller one since we process large→small)
            # is significantly inside an already-kept box
            if a > 0 and (inter / a) >= 0.50:
                suppressed = True
                break

        if not suppressed:
            keep.append((x, y, w, h))

    return keep


def _is_text_rows(binary_img, ref_dim):
    """Detect regular horizontal band patterns (text lines)."""
    h_proj = np.sum(binary_img, axis=1) / 255
    non_empty = h_proj > 0

    if np.sum(non_empty) == 0:
        return False

    transitions = np.diff(non_empty.astype(int))
    num_gaps = np.sum(transitions == -1)
    if num_gaps < 3:
        return False

    band_heights = []
    in_band = False
    band_start = 0
    for i in range(len(non_empty)):
        if non_empty[i] and not in_band:
            band_start = i
            in_band = True
        elif not non_empty[i] and in_band:
            band_heights.append(i - band_start)
            in_band = False
    if in_band:
        band_heights.append(len(non_empty) - band_start)

    if not band_heights:
        return False

    text_height_max = ref_dim * 0.02
    text_like = sum(1 for bh in band_heights if bh < text_height_max)
    return (text_like / len(band_heights)) > 0.70


def _save_crop(img_bgr, x, y, w, h, pw, ph, output_folder, counter):
    """Save padded crop, return next counter."""
    pad = 15
    y1, y2 = max(0, y - pad), min(ph, y + h + pad)
    x1, x2 = max(0, x - pad), min(pw, x + w + pad)
    cropped = img_bgr[y1:y2, x1:x2]

    if cropped.shape[0] < 20 or cropped.shape[1] < 20:
        return counter

    fname = f"figure_{counter}.png"
    cv2.imwrite(os.path.join(output_folder, fname), cropped)
    return counter + 1


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        pdf = sys.argv[1]
    else:
        pdf = input("PDF Path: ")
    out = sys.argv[2] if len(sys.argv) > 2 else "images"
    extract_images_from_pdf(pdf, out)
