"""공고 상세 본문 수집. 결과는 public/data/details/<파일명>.json 에 저장한다."""

from __future__ import annotations

import re
import time

import requests
from bs4 import BeautifulSoup

from sources import HEADERS, UA

MAX_CHARS = 15000

# 브라우저에서 본문으로 보이는 가장 큰 텍스트 덩어리를 고른다
_MAIN_TEXT_JS = r"""
() => {
  // 업무, 자격, 우대, 복지 중 2가지 이상을 포함하는 가장 작은 영역 = 공고 본문
  const G = [
    ['주요업무','주요 업무','담당업무','담당 업무','업무 내용','Responsibilities','What you'],
    ['자격요건','자격 요건','지원자격','지원 자격','필수','Qualifications','Requirements'],
    ['우대사항','우대 사항','우대','Preferred','Nice to have'],
    ['복지','혜택','근무조건','근무 조건','채용절차','전형 절차','Benefits'],
  ];
  let best = null;
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT','STYLE','NOSCRIPT'].includes(el.tagName)) continue;
    const t = (el.innerText || '').trim();
    if (t.length < 200) continue;
    const k = G.filter(g => g.some(x => t.includes(x))).length;
    if (k >= 2 && (!best || t.length < best.length)) best = t;
  }
  return best || (document.body.innerText || '');
}
"""


def safe_name(job_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", job_id)


def _clean(text: str) -> str:
    lines = [l.strip() for l in text.splitlines()]
    out, blank = [], 0
    for l in lines:
        if not l:
            blank += 1
            if blank > 1:
                continue
        else:
            blank = 0
        out.append(l)
    return "\n".join(out).strip()[:MAX_CHARS]


def _saramin(ext_id: str) -> str:
    url = f"https://www.saramin.co.kr/zf_user/jobs/relay/view-detail?rec_idx={ext_id}&rec_seq=0"
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    for t in soup(["script", "style"]):
        t.decompose()
    return soup.get_text("\n")


def _linkedin(ext_id: str) -> str:
    url = f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{ext_id}"
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    el = soup.select_one("div.show-more-less-html__markup") or soup.select_one("div.description__text")
    return el.get_text("\n") if el else ""


def _wanted(ext_id: str) -> str:
    r = requests.get(
        f"https://www.wanted.co.kr/api/v4/jobs/{ext_id}",
        headers=HEADERS | {"Referer": "https://www.wanted.co.kr/"}, timeout=30,
    )
    r.raise_for_status()
    d = (r.json().get("job") or {}).get("detail") or {}
    parts = [
        ("회사 소개", d.get("intro")), ("주요 업무", d.get("main_tasks")),
        ("자격 요건", d.get("requirements")), ("우대 사항", d.get("preferred_points")),
        ("혜택 및 복지", d.get("benefits")),
    ]
    return "\n\n".join(f"[{k}]\n{v}" for k, v in parts if v)


def _rendered(url: str, browser) -> str:
    page = browser.new_page(user_agent=UA, locale="ko-KR")
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=20000)
        try:
            page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            pass
        return page.evaluate(_MAIN_TEXT_JS)
    finally:
        page.close()


def fetch_detail(job: dict, browser) -> str:
    src, ext_id = job["source"], job["id"].split(":", 1)[1]
    text = ""
    try:
        if src == "saramin":
            text = _saramin(ext_id)
        elif src == "linkedin":
            text = _linkedin(ext_id)
        elif src == "wanted":
            text = _wanted(ext_id)
    except Exception as e:
        print(f"  [detail:{src}] 전용 방식 실패 {ext_id}: {e}")
    if len(text.strip()) < 100 and browser is not None:
        text = _rendered(job["url"], browser)
    time.sleep(1.0)
    return _clean(text)
