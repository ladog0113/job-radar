import re

from config import CATEGORIES, EXCLUDE_OVERRIDE, EXCLUDE_TERMS, HARD_EXCLUDE_TERMS, ROLE_TERMS


def _pattern(term: str) -> re.Pattern:
    # 영문 단어는 앞뒤가 영문자가 아닐 때만 매칭 (pm이 npm에 걸리지 않도록)
    if re.fullmatch(r"[a-z0-9 .\-]+", term):
        return re.compile(r"(?<![a-z])" + re.escape(term) + r"(?![a-z])")
    return re.compile(re.escape(term))


_ROLE = [_pattern(t) for t in ROLE_TERMS]
_EXCLUDE = [_pattern(t) for t in EXCLUDE_TERMS]
_HARD = [_pattern(t) for t in HARD_EXCLUDE_TERMS]
_OVERRIDE = [_pattern(t) for t in EXCLUDE_OVERRIDE]
_CATS = [(name, [_pattern(t) for t in terms]) for name, terms in CATEGORIES]


def _hits(patterns, text):
    return [p.pattern for p in patterns if p.search(text)]


def classify(title: str) -> dict | None:
    """제목 기준으로 관련 공고인지 판단하고 분류와 점수를 돌려준다. 무관하면 None."""
    t = title.lower()
    if not _hits(_ROLE, t):
        return None
    if _hits(_HARD, t):
        return None
    if _hits(_EXCLUDE, t) and not _hits(_OVERRIDE, t):
        return None
    for rank, (name, pats) in enumerate(_CATS):
        hits = _hits(pats, t)
        if hits:
            score = 100 - rank * 20 + min(len(hits), 3) * 5
            return {"category": name, "score": score}
    return None
