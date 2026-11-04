"""Exit 0 if the working tree differs from HEAD only in refresh timestamps.

The refresh runs several times a day; when no data or picks changed, there's nothing
worth committing, and the site keeps its previous "updated" time.
"""
import json
import subprocess
import sys

TIMESTAMPED = {"docs/data/site.json": ("meta", "refreshed_at"), "reports/live/meta.json": (None, "refreshed_at")}

changed = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, check=True).stdout.split("\n")
paths = {line[3:] for line in changed if line.strip()}
if not paths:
    sys.exit(0)
if not paths <= set(TIMESTAMPED):
    sys.exit(1)
for path in paths:
    outer, key = TIMESTAMPED[path]
    old = json.loads(subprocess.run(["git", "show", f"HEAD:{path}"], capture_output=True, text=True, check=True).stdout)
    new = json.loads(open(path, encoding="utf-8").read())
    for d in (old, new):
        (d[outer] if outer else d).pop(key, None)
    if old != new:
        sys.exit(1)
sys.exit(0)
