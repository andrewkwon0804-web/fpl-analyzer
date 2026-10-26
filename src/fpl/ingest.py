"""Step 1: download raw season files.

Finished seasons come from the open FPL archive and are cached in data/raw/<season>/,
so the pipeline is reproducible offline after the first run. The season in progress
comes from the official FPL API (see fetch_official.py) because the archive lags.
"""
import argparse
import urllib.request

from fpl import fetch_official
from fpl.config import LIVE_SEASON, RAW_DIR, RAW_FILES, SEASONS, SOURCE_BASE


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


def refresh_live_season() -> None:
    """Official FPL API first. If it can't be reached, keep an earlier official pull
    rather than overwrite it with the (older) archive; with no pull at all, use the archive."""
    try:
        fetch_official.main()
        return
    except OSError as err:
        print(f"  official FPL API unreachable ({err})")
    if (RAW_DIR / LIVE_SEASON / fetch_official.SOURCE_FILE).exists():
        print("  keeping the earlier pull from the official API")
        return
    print("  falling back to the open archive")
    for key in RAW_FILES:
        download(LIVE_SEASON, key, force=True)


def main(force: bool = False) -> None:
    for season in SEASONS:
        print(f"[ingest] {season}")
        if season == LIVE_SEASON:
            refresh_live_season()  # changes every week, so never trust the cache
            continue
        for key in RAW_FILES:
            download(season, key, force=force)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="re-download even if cached")
    main(parser.parse_args().force)
