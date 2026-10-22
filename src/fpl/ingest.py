"""Step 1: download raw season files from the open FPL archive.

Files are cached in data/raw/<season>/ so the pipeline is reproducible offline
after the first run.
"""
import argparse
import urllib.request

from fpl.config import RAW_DIR, RAW_FILES, SEASONS, SOURCE_BASE


def download(season: str, key: str, force: bool = False) -> None:
    rel = RAW_FILES[key]
    dest = RAW_DIR / season / rel.split("/")[-1]
    if dest.exists() and not force:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = f"{SOURCE_BASE}/{season}/{rel}"
    print(f"  downloading {url}")
    with urllib.request.urlopen(url, timeout=60) as resp:
        dest.write_bytes(resp.read())


def main(force: bool = False) -> None:
    for season in SEASONS:
        print(f"[ingest] {season}")
        for key in RAW_FILES:
            download(season, key, force=force)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="re-download even if cached")
    main(parser.parse_args().force)
