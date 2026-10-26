"""공고의 요구 경력 연차를 숫자로 뽑는다. (min, max, any_ok)

any_ok: 경력무관, 신입/경력 모두 가능처럼 연차 제한이 없는 공고
min/max: 년 단위. 모르면 None
"""

from __future__ import annotations

import re

_RANGE = re.compile(r"(\d{1,2})\s*(?:년)?\s*[~\-–]\s*(\d{1,3})\s*년")
_MIN = re.compile(r"(\d{1,2})\s*년\s*(?:↑|이상|\+)")
_MAX = re.compile(r"(\d{1,2})\s*년\s*(?:↓|이하|미만)")
_EN_MIN = re.compile(r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)", re.I)

# 본문에서는 경력/경험 단어 근처의 '숫자년 이상'만 요구 경력으로 본다
_DETAIL = re.compile(
    r"(?:경력|경험|실무|업무)[^\n]{0,25}?(\d{1,2})\s*년\s*(?:↑|이상|\+)"
    r"|(\d{1,2})\s*년\s*(?:↑|이상|\+)[^\n]{0,15}?(?:경력|경험|실무)"
    r"|(\d{1,2})\s*~\s*(\d{1,2})\s*년[^\n]{0,10}?(?:경력|경험)"
    r"|(?:경력|경험)[^\n]{0,10}?(\d{1,2})\s*~\s*(\d{1,2})\s*년"
    r"|(\d{1,2})\s*\+?\s*years?[^\n]{0,30}?experience"
    r"|(?:at least|minimum of|min\.?)\s*(\d{1,2})\s*years?",
    re.I,
)

_PREFERRED = re.compile(r"(우대|preferred|nice to have|plus)", re.I)


def _norm_max(v: int | None) -> int | None:
    return None if v is None or v >= 30 else v


def parse_career_field(text: str) -> tuple[int | None, int | None, bool]:
    t = (text or "").strip()
    if not t:
        return None, None, False
    if "무관" in t or "신입·경력" in t or "신입/경력" in t:
        return None, None, True
    m = _RANGE.search(t)
    if m:
        return int(m.group(1)), _norm_max(int(m.group(2))), False
    m = _MIN.search(t)
    if m:
        return int(m.group(1)), None, False
    m = _MAX.search(t)
    if m:
        return None, int(m.group(1)), False
    if "신입" in t and "경력" not in t:
        return 0, 1, False
    m = _EN_MIN.search(t)
    if m:
        return int(m.group(1)), None, False
    return None, None, False


def parse_detail(text: str) -> tuple[int | None, int | None]:
    """본문에서 요구 경력의 최소 연차. 우대사항 줄에 나온 연차는 제외한다."""
    mins: list[int] = []
    maxes: list[int] = []
    for line in (text or "").splitlines():
        if _PREFERRED.search(line):
            continue
        for m in _DETAIL.finditer(line):
            g = [x for x in m.groups()]
            if g[2] and g[3]:
                mins.append(int(g[2])); maxes.append(int(g[3]))
            elif g[4] and g[5]:
                mins.append(int(g[4])); maxes.append(int(g[5]))
            else:
                v = next((x for x in (g[0], g[1], g[6], g[7]) if x), None)
                if v:
                    mins.append(int(v))
    mins = [m for m in mins if m <= 25]
    if not mins:
        return None, None
    lo = min(mins)
    hi = max(maxes) if maxes else None
    return lo, _norm_max(hi)


def parse_career(field: str, detail: str = "") -> dict:
    lo, hi, any_ok = parse_career_field(field)
    if lo is None and hi is None and not any_ok and detail:
        lo, hi = parse_detail(detail)
        if lo is None and re.search(r"(년수|연차|경력)\s*무관", detail):
            any_ok = True
    return {"career_min": lo, "career_max": hi, "career_any": any_ok}
