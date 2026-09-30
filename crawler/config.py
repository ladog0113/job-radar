"""수집 키워드와 분류 규칙. 여기만 고치면 검색 범위가 바뀐다."""

# 각 사이트 검색창에 넣을 검색어
SEARCH_QUERIES = [
    "MLOps",
    "LLMOps",
    "AI 인프라",
    "GPU",
    "AI 플랫폼",
    "AI PM",
    "AI PO",
    "AI 기획",
    "AI 서비스 기획",
    "Product Manager AI",
    "프로덕트 매니저 AI",
    "LLM 기획",
    "에이전트 기획",
]

# 제목에 하나 이상 있어야 하는 직무 단어 (대소문자 무시)
ROLE_TERMS = [
    "pm", "po", "product manager", "product owner", "프로덕트 매니저", "프로덕트 오너",
    "프로덕트매니저", "프로덕트오너", "기획", "planner", "product lead", "tpm",
    "technical program", "서비스 매니저", "제품 매니저", "제품매니저", "제품 관리",
]

# 분류별 도메인 단어. 먼저 걸리는 분류로 들어간다.
CATEGORIES = [
    ("AI 인프라/MLOps", [
        "mlops", "ml ops", "gpu", "인프라", "infra", "클라우드", "cloud", "npu",
        "hpc", "데이터센터", "쿠버네티스", "kubernetes", "ml platform", "ml 플랫폼",
        "학습 플랫폼", "serving", "서빙",
    ]),
    ("LLMOps/에이전트", [
        "llmops", "llm ops", "agent", "에이전트", "rag", "llm 플랫폼", "genai platform",
        "ai 플랫폼", "ai platform", "워크플로우", "orchestr",
    ]),
    ("AI 서비스 기획", [
        "ai", "llm", "생성형", "genai", "gen ai", "인공지능", "머신러닝", "machine learning",
        "딥러닝", "챗봇", "chatbot", "데이터", "data",
    ]),
]

# 제목에 있으면 제외 (엔지니어 직군, 영업 등)
EXCLUDE_TERMS = [
    "engineer", "엔지니어", "developer", "개발자", "researcher", "연구원", "scientist",
    "사이언티스트", "영업", "sales", "마케터", "marketing", "디자이너", "designer",
    "인턴", "intern", "회계", "재무", "hr", "강사", "교육생",
]
# EXCLUDE 단어가 있어도 이 단어가 함께 있으면 살린다 (예: "Engineering PM")
EXCLUDE_OVERRIDE = ["product manager", "product owner", "pm", "po", "기획", "프로덕트"]

# 무조건 제외 (직무 단어가 있어도 제외)
HARD_EXCLUDE_TERMS = ["영업기획", "영업 기획", "sales", "마케팅", "marketing", "경영기획", "재무기획", "인사기획", "교육기획", "강사"]

# 이 일수 동안 다시 보이지 않은 공고는 목록에서 '마감 추정'으로 표시
STALE_DAYS = 14
