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
from details import fetch_detail, safe_name
from config import SEARCH_QUERIES, STALE_DAYS
from sources import LABELS, SITES, crawl_linkedin, crawl_rendered, crawl_saramin, crawl_wanted

KST = timezone(timedelta(hours=9))
DATA_DIR = Path(__file__).resolve().parent.parent / "public" / "data"
JOBS_FILE = DATA_DIR / "jobs.json"
RUNS_FILE = DATA_DIR / "runs.json"
DETAIL_DIR = DATA_DIR / "details"
MAX_DETAILS_PER_RUN = 60  # 하루에 새로 받아올 상세 본문 최대 개수

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
    if True:  # 상세 본문 수집에도 브라우저가 필요
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
                elif site == "wanted":
                    postings = crawl_wanted(SEARCH_QUERIES, browser)
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

        # 상세 본문: 아직 없는 공고만, 최근 공고부터
        DETAIL_DIR.mkdir(parents=True, exist_ok=True)
        todo = [
            j for j in sorted(jobs.values(), key=lambda j: j["first_seen"], reverse=True)
            if not (DETAIL_DIR / f"{safe_name(j['id'])}.json").exists()
        ][:MAX_DETAILS_PER_RUN]
        got = 0
        for j in todo:
            try:
                text = fetch_detail(j, browser)
            except Exception as e:
                print(f"  [detail] {j['id']} 실패: {e}")
                continue
            if len(text) < 50:
                continue
            (DETAIL_DIR / f"{safe_name(j['id'])}.json").write_text(
                json.dumps({"id": j["id"], "text": text, "fetched_at": today}, ensure_ascii=False),
                encoding="utf-8",
            )
            got += 1
        run_log["details"] = {"tried": len(todo), "saved": got}
        print(f"[details] tried={len(todo)} saved={got}")
    finally:
        if browser:
            browser.close()
        if pw:
            pw.stop()

    for j in jobs.values():
        j["has_detail"] = (DETAIL_DIR / f"{safe_name(j['id'])}.json").exists()

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
