"""매일 실행: 8개 사이트 수집 → 분류 → public/data/jobs.json 누적.

사용법
  python crawler/main.py                 # 전체 사이트
  python crawler/main.py --sites saramin linkedin
"""

from __future__ import annotations

import argparse
import json
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

from classify import classify
from config import SEARCH_QUERIES, STALE_DAYS
from sources import LABELS, SITES, crawl_linkedin, crawl_rendered, crawl_saramin

KST = timezone(timedelta(hours=9))
DATA_DIR = Path(__file__).resolve().parent.parent / "public" / "data"
JOBS_FILE = DATA_DIR / "jobs.json"
RUNS_FILE = DATA_DIR / "runs.json"

ALL_SITES = ["wanted", "saramin", "jobkorea", "jobplanet", "jasoseol", "remember", "catch", "linkedin"]


def load(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def run(sites: list[str]) -> None:
    now = datetime.now(KST)
    today = now.strftime("%Y-%m-%d")
    jobs: dict[str, dict] = {j["id"]: j for j in load(JOBS_FILE, [])}
    runs: list[dict] = load(RUNS_FILE, [])
    run_log = {"started_at": now.isoformat(timespec="seconds"), "sources": []}

    browser = None
    pw = None
    if any(s in SITES for s in sites):
        from playwright.sync_api import sync_playwright

        pw = sync_playwright().start()
        browser = pw.chromium.launch(headless=True)

    try:
        for site in sites:
            entry = {"source": site, "label": LABELS[site], "fetched": 0, "matched": 0, "new": 0, "error": None}
            try:
                if site == "saramin":
                    postings = crawl_saramin(SEARCH_QUERIES)
                elif site == "linkedin":
                    postings = crawl_linkedin(SEARCH_QUERIES)
                else:
                    postings = crawl_rendered(site, SEARCH_QUERIES, browser)
                entry["fetched"] = len(postings)
                for p in postings:
                    c = classify(p.title)
                    if not c:
                        continue
                    entry["matched"] += 1
                    jid = f"{p.source}:{p.ext_id}"
                    prev = jobs.get(jid)
                    if prev is None:
                        entry["new"] += 1
                    jobs[jid] = {
                        "id": jid,
                        "source": p.source,
                        "title": p.title,
                        "company": p.company or (prev or {}).get("company", ""),
                        "location": p.location,
                        "career": p.career,
                        "deadline": p.deadline,
                        "url": p.url,
                        "category": c["category"],
                        "score": c["score"],
                        "queries": sorted(set(p.queries) | set((prev or {}).get("queries", []))),
                        "first_seen": (prev or {}).get("first_seen", today),
                        "last_seen": today,
                    }
                if entry["fetched"] == 0:
                    entry["error"] = "0건 수집: 검색 주소나 링크 패턴이 바뀌었을 수 있음"
            except Exception as e:  # 한 사이트 실패가 전체를 멈추지 않게
                entry["error"] = f"{type(e).__name__}: {e}"[:300]
                traceback.print_exc()
            print(f"[{site}] fetched={entry['fetched']} matched={entry['matched']} new={entry['new']} error={entry['error']}")
            run_log["sources"].append(entry)
    finally:
        if browser:
            browser.close()
        if pw:
            pw.stop()

    stale_before = (now - timedelta(days=STALE_DAYS)).strftime("%Y-%m-%d")
    for j in jobs.values():
        j["stale"] = j["last_seen"] < stale_before

    run_log["finished_at"] = datetime.now(KST).isoformat(timespec="seconds")
    runs = (runs + [run_log])[-60:]

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ordered = sorted(jobs.values(), key=lambda j: (j["first_seen"], j["score"]), reverse=True)
    JOBS_FILE.write_text(json.dumps(ordered, ensure_ascii=False, indent=1), encoding="utf-8")
    RUNS_FILE.write_text(json.dumps(runs, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"total={len(ordered)} saved to {JOBS_FILE}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sites", nargs="*", default=ALL_SITES, choices=ALL_SITES)
    args = ap.parse_args()
    run(args.sites)
