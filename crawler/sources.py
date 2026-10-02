"""사이트별 수집기.

사이트 구조가 바뀌면 SITES 표의 search_url 또는 link_pattern만 고치면 되도록 만들었다.
사람인과 링크드인은 서버에서 HTML을 그대로 주므로 requests로 가져오고,
나머지는 화면이 자바스크립트로 그려지므로 Playwright(헤드리스 크롬)로 연 뒤
공고 상세 링크 패턴에 맞는 <a>를 모아 제목과 회사명을 뽑는다.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from urllib.parse import quote, urljoin

import requests
from bs4 import BeautifulSoup

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
HEADERS = {"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"}
DELAY_SEC = 1.5  # 같은 사이트에 연속 요청할 때 간격
GOTO_TIMEOUT_MS = 20000  # 페이지 접속 제한 시간
MAX_CONSECUTIVE_FAILS = 2  # 이만큼 연속 접속 실패하면 그 사이트는 건너뜀
RENDER_WAIT_MS = 15000  # 공고 목록이 그려질 때까지 기다리는 최대 시간


@dataclass
class Posting:
    source: str
    ext_id: str
    title: str
    company: str = ""
    location: str = ""
    career: str = ""
    deadline: str = ""
    url: str = ""
    queries: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# 렌더링 기반 사이트 설정
# ---------------------------------------------------------------------------
SITES = {
    "wanted": {
        "label": "원티드",
        "base": "https://www.wanted.co.kr",
        "search_url": "https://www.wanted.co.kr/search?query={q}&tab=position",
        "link_pattern": r"/wd/(\d+)",
    },
    "jobkorea": {
        "label": "잡코리아",
        "base": "https://www.jobkorea.co.kr",
        "search_url": "https://www.jobkorea.co.kr/Search/?stext={q}&tabType=recruit&Ord=RegDtDesc",
        "link_pattern": r"/Recruit/GI_Read/(\d+)",
    },
    "jobplanet": {
        "label": "잡플래닛",
        "base": "https://www.jobplanet.co.kr",
        "search_url": "https://www.jobplanet.co.kr/job/search?q={q}",
        "link_pattern": r"(?:posting_ids(?:%5B%5D|\[\])=|/job_postings/|/job/search\?.*?posting_id=)(\d+)",
    },
    "remember": {
        "label": "리멤버",
        "base": "https://career.rememberapp.co.kr",
        "search_url": "https://career.rememberapp.co.kr/job/postings?search=%7B%22keywords%22%3A%5B%22{q}%22%5D%7D",
        "link_pattern": r"/job/posting/(\d+)",
    },
    "catch": {
        "label": "캐치",
        "base": "https://www.catch.co.kr",
        "search_url": "https://www.catch.co.kr/Search/SearchList?Keyword={q}",
        "link_pattern": r"/NCS/RecruitInfoDetails/(\d+)",
    },
    "jasoseol": {
        "label": "자소설닷컴",
        "base": "https://jasoseol.com",
        "search_url": "https://jasoseol.com/search?keyword={q}",
        "link_pattern": r"/recruit/(\d+)",
    },
}

LABELS = {k: v["label"] for k, v in SITES.items()} | {"saramin": "사람인", "linkedin": "링크드인"}

# 브라우저 안에서 실행: 링크 패턴에 맞는 <a>와 그 카드 영역의 텍스트를 모은다
_EXTRACT_JS = r"""
(pattern) => {
  const re = new RegExp(pattern);
  const out = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.href;
    if (!re.test(href)) continue;
    let card = a;
    for (let i = 0; i < 6 && card.parentElement; i++) {
      const p = card.parentElement;
      if ((p.innerText || '').length > 600) break;
      card = p;
      if (/^(LI|ARTICLE)$/.test(p.tagName)) break;
    }
    const pick = (sel) => {
      const el = card.querySelector(sel);
      return el ? el.innerText.trim() : '';
    };
    out.push({
      href,
      anchorText: (a.innerText || a.getAttribute('title') || a.getAttribute('aria-label') || '').trim(),
      titleText: pick('h2, h3, h4, strong, [class*="title" i], [class*="position" i], [class*="subject" i]'),
      company: pick('[class*="company" i], [class*="corp" i], [class*="Company"], [data-company-name]'),
      lines: (card.innerText || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 12),
    });
  }
  return out;
}
"""

_CAREER_RE = re.compile(r"(신입|경력\s*[\d~\-년 ↑이상무관]*|경력무관|\d+\s*~\s*\d+\s*년|\d+년\s*이상)")
_ROLEISH_RE = re.compile(r"(PM|PO|기획|Manager|Owner|매니저|오너)", re.I)
_DEADLINE_RE = re.compile(r"(D-\d+|상시채용|채용시\s*마감|~\s*\d{1,2}[./]\d{1,2}|\d{4}[./-]\d{1,2}[./-]\d{1,2})")


def _guess_fields(item: dict) -> tuple[str, str, str, str]:
    lines = [l for l in item["lines"] if l]
    anchor_lines = [l.strip() for l in item["anchorText"].split("\n") if l.strip()]
    title = ""
    heading = (item.get("titleText") or "").split("\n")[0].strip()
    for cand in [heading] + anchor_lines + lines:
        if len(cand) >= 6 and not _DEADLINE_RE.fullmatch(cand) and not cand.startswith("D-"):
            title = cand
            break
    company = item["company"].split("\n")[0] if item["company"] else ""
    if not company:
        for l in lines:
            if l != title and not _ROLEISH_RE.search(l) and 2 <= len(l) <= 30 and not _CAREER_RE.search(l) and not _DEADLINE_RE.search(l):
                company = l
                break
    joined = " ".join(lines)
    career = (_CAREER_RE.search(joined) or [""])[0]
    deadline = (_DEADLINE_RE.search(joined) or [""])[0]
    return title, company, career, deadline


def crawl_rendered(site_key: str, queries: list[str], browser) -> list[Posting]:
    cfg = SITES[site_key]
    link_re = re.compile(cfg["link_pattern"])
    found: dict[str, Posting] = {}
    fails = 0
    last_error = ""
    page = browser.new_page(user_agent=UA, locale="ko-KR")
    try:
        for q in queries:
            url = cfg["search_url"].format(q=quote(q))
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=GOTO_TIMEOUT_MS)
            except Exception as e:
                # 접속 실패: 검색어 하나만 건너뛰고, 연속으로 실패하면 사이트 전체를 중단
                fails += 1
                last_error = f"{type(e).__name__}: {str(e).splitlines()[0]}"
                print(f"  [{site_key}] '{q}' 접속 실패 ({fails}회 연속): {last_error}")
                if fails >= MAX_CONSECUTIVE_FAILS:
                    break
                continue
            fails = 0
            # 공고 링크가 화면에 나타날 때까지 기다린다 (자바스크립트로 그려지는 사이트 대응)
            try:
                page.wait_for_function(
                    "(p) => [...document.querySelectorAll('a[href]')].some(a => new RegExp(p).test(a.href))",
                    arg=cfg["link_pattern"], timeout=RENDER_WAIT_MS,
                )
            except Exception:
                pass
            try:
                page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                pass
            for _ in range(3):  # 무한 스크롤 대응
                page.mouse.wheel(0, 4000)
                page.wait_for_timeout(800)
            for item in page.evaluate(_EXTRACT_JS, cfg["link_pattern"]):
                m = link_re.search(item["href"])
                if not m:
                    continue
                ext_id = m.group(1)
                if ext_id in found:
                    if q not in found[ext_id].queries:
                        found[ext_id].queries.append(q)
                    continue
                title, company, career, deadline = _guess_fields(item)
                if not title:
                    continue
                found[ext_id] = Posting(
                    source=site_key, ext_id=ext_id, title=title, company=company,
                    career=career, deadline=deadline,
                    url=urljoin(cfg["base"], item["href"]), queries=[q],
                )
            time.sleep(DELAY_SEC)
    finally:
        page.close()
    if not found and last_error:
        raise RuntimeError(f"접속 실패 (해외 IP 차단 가능성): {last_error}")
    return list(found.values())


# ---------------------------------------------------------------------------
# 원티드: 검색 API (JSON). 막히면 브라우저 방식으로 다시 시도
# ---------------------------------------------------------------------------
def crawl_wanted(queries: list[str], browser) -> list[Posting]:
    found: dict[str, Posting] = {}
    try:
        for q in queries:
            url = (
                "https://www.wanted.co.kr/api/chaos/search/v1/position"
                f"?query={quote(q)}&country=kr&years=-1&sort=job.latest_order&limit=50&offset=0"
            )
            r = requests.get(url, headers=HEADERS | {"Referer": "https://www.wanted.co.kr/"}, timeout=30)
            r.raise_for_status()
            for d in r.json().get("data", []):
                ext_id = str(d.get("id", ""))
                if not ext_id:
                    continue
                if ext_id in found:
                    found[ext_id].queries.append(q)
                    continue
                a_from, a_to = d.get("annual_from"), d.get("annual_to")
                career = "" if a_from is None else ("신입" if a_to in (0, 1) and a_from == 0 else f"경력 {a_from}~{a_to}년")
                found[ext_id] = Posting(
                    source="wanted", ext_id=ext_id, title=d.get("position", ""),
                    company=(d.get("company") or {}).get("name", ""), career=career,
                    url=f"https://www.wanted.co.kr/wd/{ext_id}", queries=[q],
                )
            time.sleep(DELAY_SEC)
    except Exception as e:
        print(f"  [wanted] API 실패, 브라우저 방식으로 재시도: {e}")
    if found:
        return list(found.values())
    return crawl_rendered("wanted", queries, browser)


# ---------------------------------------------------------------------------
# 사람인: 서버 렌더링 HTML
# ---------------------------------------------------------------------------
def crawl_saramin(queries: list[str]) -> list[Posting]:
    found: dict[str, Posting] = {}
    for q in queries:
        url = (
            "https://www.saramin.co.kr/zf_user/search/recruit"
            f"?searchword={quote(q)}&recruitSort=reg_dt&recruitPageCount=40"
        )
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        for item in soup.select("div.item_recruit"):
            ext_id = item.get("value") or ""
            a = item.select_one("h2.job_tit a")
            if not a:
                continue
            if not ext_id:
                m = re.search(r"rec_idx=(\d+)", a.get("href", ""))
                ext_id = m.group(1) if m else ""
            if not ext_id:
                continue
            if ext_id in found:
                found[ext_id].queries.append(q)
                continue
            cond = [s.get_text(" ", strip=True) for s in item.select("div.job_condition span")]
            corp = item.select_one("strong.corp_name a")
            date = item.select_one("div.job_date span.date")
            found[ext_id] = Posting(
                source="saramin", ext_id=ext_id,
                title=(a.get("title") or a.get_text(strip=True)),
                company=corp.get_text(strip=True) if corp else "",
                location=cond[0] if cond else "",
                career=cond[1] if len(cond) > 1 else "",
                deadline=date.get_text(strip=True) if date else "",
                url=f"https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx={ext_id}",
                queries=[q],
            )
        time.sleep(DELAY_SEC)
    return list(found.values())


# ---------------------------------------------------------------------------
# 링크드인: 비로그인 공개 검색 (최근 1주, 대한민국)
# ---------------------------------------------------------------------------
LINKEDIN_QUERIES = [
    "MLOps product manager",
    "LLMOps product manager",
    "AI platform product manager",
    "AI infrastructure product manager",
    "GPU product manager",
    "AI product owner",
    "AI product manager",
]


def crawl_linkedin(_queries: list[str]) -> list[Posting]:
    found: dict[str, Posting] = {}
    for q in LINKEDIN_QUERIES:
        for start in (0, 25):
            url = (
                "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
                f"?keywords={quote(q)}&location=South%20Korea&geoId=105149562&f_TPR=r604800&start={start}"
            )
            r = requests.get(url, headers=HEADERS, timeout=30)
            if r.status_code != 200 or not r.text.strip():
                break
            soup = BeautifulSoup(r.text, "html.parser")
            cards = soup.select("div.base-card")
            if not cards:
                break
            for c in cards:
                urn = c.get("data-entity-urn", "")
                ext_id = urn.rsplit(":", 1)[-1] if urn else ""
                link = c.select_one("a.base-card__full-link")
                if not ext_id and link:
                    m = re.search(r"-(\d+)\?", link.get("href", ""))
                    ext_id = m.group(1) if m else ""
                if not ext_id:
                    continue
                if ext_id in found:
                    found[ext_id].queries.append(q)
                    continue
                t = c.select_one("h3.base-search-card__title")
                co = c.select_one("h4.base-search-card__subtitle")
                loc = c.select_one("span.job-search-card__location")
                found[ext_id] = Posting(
                    source="linkedin", ext_id=ext_id,
                    title=t.get_text(strip=True) if t else "",
                    company=co.get_text(strip=True) if co else "",
                    location=loc.get_text(strip=True) if loc else "",
                    url=f"https://www.linkedin.com/jobs/view/{ext_id}/",
                    queries=[q],
                )
            time.sleep(DELAY_SEC)
    return list(found.values())
