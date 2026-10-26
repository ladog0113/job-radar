"""잡플래닛 기업 평점과 최근 리뷰 메타 정보 수집.

리뷰 본문(장점, 단점)은 로그인한 사용자에게만 제공되므로 수집하지 않는다.
비로그인으로 공개된 값만 저장: 총 평점, 항목별 평점, 추천율 등 통계, 최근 리뷰의 작성 시기, 직군, 점수.
결과는 public/data/companies.json 에 회사 키별로 캐시하고 REFRESH_DAYS 마다 갱신한다.
"""

from __future__ import annotations

import re
import time
from datetime import datetime, timedelta
from urllib.parse import quote

from bs4 import BeautifulSoup

from sources import UA

BASE = "https://www.jobplanet.co.kr"
REFRESH_DAYS = 14
MAX_LOOKUPS_PER_RUN = 40
RECENT_REVIEWS = 5

_STRIP = re.compile(r"\(주\)|㈜|주식회사|\(유\)|유한회사|\(사\)|\(재\)|\(의\)|\(합\)")


def company_key(name: str) -> str:
    s = _STRIP.sub("", name or "")
    s = re.sub(r"\[[^\]]*\]", "", s)
    s = re.sub(r"[\s·.,]", "", s).lower()
    return s


def _skip(name: str) -> bool:
    return not name or "헤드헌팅" in name or "서치펌" in name or len(company_key(name)) < 2


def _num(pattern: str, text: str) -> float | None:
    m = re.search(pattern, text)
    return float(m.group(1)) if m else None


class _Browser:
    """잡플래닛은 일반 HTTP 요청을 막아서 브라우저(Playwright)로 연다"""

    def __init__(self, browser):
        self.page = browser.new_page(user_agent=UA, locale="ko-KR")

    def html(self, url: str) -> str:
        resp = self.page.goto(url, wait_until="domcontentloaded", timeout=30000)
        if resp is not None and resp.status >= 400:
            raise RuntimeError(f"HTTP {resp.status}")
        try:
            self.page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass
        return self.page.content()

    def json(self, url: str):
        # 현재 열린 잡플래닛 페이지 안에서 호출 (같은 출처, 쿠키 포함)
        return self.page.evaluate(
            "async (u) => { const r = await fetch(u, {headers: {Accept: 'application/json'}});"
            " if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }",
            url,
        )

    def close(self):
        self.page.close()


def find_company(b: _Browser, name: str) -> dict | None:
    soup = BeautifulSoup(b.html(f"{BASE}/search/companies?query={quote(name)}"), "html.parser")
    target = company_key(name)
    for a in soup.select('a[href*="/companies/"]'):
        h4 = a.find("h4")
        if not h4 or company_key(h4.get_text(strip=True)) != target:
            continue
        m = re.search(r"/companies/(\d+)", a.get("href", ""))
        if not m:
            continue
        rating = None
        for sp in a.find_all("span"):
            t = sp.get_text(strip=True)
            if re.fullmatch(r"\d\.\d", t):
                rating = float(t)
                break
        return {"jp_id": int(m.group(1)), "jp_name": h4.get_text(strip=True), "rating": rating}
    return None


def company_stats(b: _Browser, jp_id: int) -> dict:
    text = re.sub(r"\s+", " ", BeautifulSoup(b.html(f"{BASE}/companies/{jp_id}/reviews"), "html.parser").get_text(" "))
    i = text.find("전체 리뷰 통계")
    text = text[i : i + 600] if i >= 0 else ""
    count = _num(r"전체 리뷰 통계\s*\((\d+)\s*명\)", text)
    return {
        "review_count": int(count) if count is not None else None,
        "overall": _num(r"전체 리뷰 통계\s*\(\d+\s*명\)\s*([\d.]+)", text),
        "scores": {
            "복지/급여": _num(r"복지/급여\s*([\d.]+)", text),
            "워라밸": _num(r"워라밸\s*([\d.]+)", text),
            "사내문화": _num(r"사내문화\s*([\d.]+)", text),
            "승진 기회": _num(r"승진 기회\s*([\d.]+)", text),
            "경영진": _num(r"경영진\s*([\d.]+)", text),
        },
        "recommend_pct": _num(r"(\d+)\s*%\s*기업 추천율", text),
        "ceo_pct": _num(r"(\d+)\s*%\s*CEO 지지율", text),
        "growth_pct": _num(r"(\d+)\s*%\s*성장 가능성", text),
    }


def recent_reviews(b: _Browser, jp_id: int) -> list[dict]:
    """company_stats 직후(리뷰 페이지가 열린 상태)에 호출"""
    data = b.json(f"/api/v4/companies/reviews/list?device=desktop&company_id={jp_id}&page=1")
    out = []
    for it in ((data or {}).get("data") or {}).get("items") or []:
        if it.get("type") != "COMPANY_REVIEW":
            continue
        rv = it.get("review") or {}
        sc = rv.get("score") or {}
        out.append({
            "date": rv.get("date") or "",
            "occupation": rv.get("occupation_name") or "",
            "status": rv.get("employ_status_name") or "",
            "overall": sc.get("overall"),
            "worklife": sc.get("worklife_balance_rating"),
            "compensation": sc.get("compensation_rating"),
            "culture": sc.get("culture_rating"),
            "advancement": sc.get("advancement_rating"),
            "management": sc.get("management_rating"),
            "recommend": rv.get("recommend_to_friend"),
        })
        if len(out) >= RECENT_REVIEWS:
            break
    return out


def update_companies(jobs: list[dict], cache: dict, today: str, browser) -> dict:
    """jobs의 회사 중 캐시가 없거나 오래된 회사만 조회. job에 company_key를 넣는다."""
    fresh_after = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=REFRESH_DAYS)).strftime("%Y-%m-%d")
    todo: list[tuple[str, str]] = []
    seen: set[str] = set()
    for j in sorted(jobs, key=lambda x: x["first_seen"], reverse=True):
        name = j.get("company", "")
        if _skip(name):
            j["company_key"] = ""
            continue
        key = company_key(name)
        j["company_key"] = key
        if key in seen:
            continue
        seen.add(key)
        if cache.get(key, {}).get("fetched_at", "") < fresh_after:
            todo.append((key, name))

    looked = found = failed = 0
    last_error = None
    b = _Browser(browser)
    try:
        for key, name in todo[:MAX_LOOKUPS_PER_RUN]:
            looked += 1
            entry = {"fetched_at": today, "jp_id": None}
            try:
                hit = find_company(b, name)
                if hit:
                    entry.update(hit)
                    entry["url"] = f"{BASE}/companies/{hit['jp_id']}/reviews"
                    try:
                        entry.update(company_stats(b, hit["jp_id"]))
                        entry["reviews"] = recent_reviews(b, hit["jp_id"])
                    except Exception as e:
                        print(f"  [jobplanet] 통계/리뷰 실패 {name}: {e}")
                    found += 1
            except Exception as e:
                failed += 1
                last_error = f"{type(e).__name__}: {str(e).splitlines()[0]}"[:200]
                print(f"  [jobplanet] 검색 실패 {name}: {last_error}")
                if failed >= 3 and found == 0:
                    break  # 연속 실패면 이번 실행은 중단
                continue  # 일시 오류는 캐시하지 않고 다음 실행에서 재시도
            cache[key] = entry
            time.sleep(1.5)
    finally:
        b.close()
    print(f"[jobplanet] looked={looked} found={found} failed={failed} pending={max(0, len(todo) - looked)}")
    return {"looked": looked, "found": found, "failed": failed, "error": last_error}
