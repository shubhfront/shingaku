
import json, shutil, os, sys
sys.path.insert(0, '/home/nirusaki/tiramisu')
os.chdir('/home/nirusaki/tiramisu')
from hello import extract_images_from_pdf

with open('training_results.json') as f:
    results = json.load(f)

updated = 0
for drive_id, entry in results.items():
    if 'ground_truth' not in entry:
        continue
    title = entry['title']
    safe = title.replace('/', '_').replace(' ', '_')
    pdf_path = os.path.join('training_data', safe)
    if not os.path.exists(pdf_path):
        continue
    img_dir = os.path.join('training_data', f'images_{safe.replace(".pdf", "")}')
    if os.path.exists(img_dir):
        shutil.rmtree(img_dir)
    extracted = extract_images_from_pdf(pdf_path, img_dir)
    old = entry['extracted']
    new = len(extracted)
    entry['extracted'] = new
    entry['diff'] = new - entry['ground_truth']
    entry['match'] = new == entry['ground_truth']
    if old != new:
        updated += 1

with open('training_results.json', 'w') as f:
    json.dump(results, f, indent=2)

# summary dega yaha par
evaluated = {k: v for k, v in results.items() if 'ground_truth' in v}
matches = sum(1 for v in evaluated.values() if v['match'])
total = len(evaluated)
print(f"\nTotal evaluated: {total}")
print(f"Exact matches:   {matches}/{total} ({100*matches/total:.0f}%)")

mismatches = [v for v in evaluated.values() if not v['match']]
over = [v for v in mismatches if v['diff'] > 0]
under = [v for v in mismatches if v['diff'] < 0]
print(f"Over-extracted:   {len(over)}")
print(f"Under-extracted:  {len(under)}")

if mismatches:
    print(f"\nMismatches:")
    for v in sorted(mismatches, key=lambda x: abs(x['diff']), reverse=True):
        print(f"  {v['title']:50s} ext={v['extracted']} truth={v['ground_truth']} ({v['diff']:+d})")

diffs = [abs(v['diff']) for v in evaluated.values()]
print(f"\nAvg abs error: {sum(diffs)/len(diffs):.2f}")
print(f"Max abs error: {max(diffs)}")
print(f"Updated: {updated} entries")
