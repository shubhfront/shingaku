#!/usr/bin/env python3
"""Test extraction on all known papers."""
import shutil, os, sys
sys.path.insert(0, '/home/nirusaki/tiramisu')
os.chdir('/home/nirusaki/tiramisu')
from hello import extract_images_from_pdf

tests = [
    ('Paper12.pdf', 3, 'scanned real'),
    ('Paper1.pdf', 11, 'digital real'),
    ('training_data/MID_SEM_2024-25_(Paper_1).pdf', 0, 'rough work'),
    ('training_data/MID_SEM_2025_(Paper_2).pdf', 0, 'text block'),
    ('training_data/END_SEM_2023(NEW).pdf', 0, 'full page'),
    ('training_data/MID_SEM_2024-25_(Paper_4).pdf', 0, 'rough/table'),
    ('training_data/Paper_1.pdf', 0, 'scanned text'),
    ('training_data/Paper_2.pdf', 0, 'scanned text'),
    ('training_data/Paper_3.pdf', 0, 'scanned text'),
    ('training_data/Paper_5.pdf', 0, 'scanned text'),
]

ok = fail = 0
for path, expected, desc in tests:
    if not os.path.exists(path):
        print(f"SKIP {os.path.basename(path):45s} (not found)")
        continue
    out = '/tmp/test_extract'
    if os.path.exists(out): shutil.rmtree(out)
    extracted = extract_images_from_pdf(path, out)
    count = len(extracted)
    m = 'OK' if count == expected else 'FAIL'
    if count == expected: ok += 1
    else: fail += 1
    print(f"{m:4s} {os.path.basename(path):45s} ({desc:15s}) exp={expected:2d} got={count:2d}")

print(f"\n{ok}/{ok+fail} passed")
