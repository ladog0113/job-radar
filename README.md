# Job Radar

원티드, 사람인, 잡코리아, 잡플래닛, 자소설닷컴, 리멤버, 캐치, 링크드인에서 AI 플랫폼 PM/PO, MLOps/LLMOps, AI 인프라, AI 서비스 기획 공고를 매일 수집해 보여주는 웹.

- 수집: `crawler/` (Python, Playwright)
- 화면: Next.js 정적 사이트 (admin-template 기반)
- 실행: GitHub Actions가 매일 07:00 KST에 수집 → `public/data/*.json` 커밋 → GitHub Pages 배포

## 처음 설정

1. GitHub에 새 저장소를 만들고 이 폴더를 push
2. 저장소 Settings > Pages > Build and deployment > Source를 `GitHub Actions`로 변경
3. Settings > Actions > General > Workflow permissions를 `Read and write permissions`로 변경
4. Actions 탭 > daily-crawl > Run workflow로 첫 실행
5. 완료 후 `https://<계정>.github.io/<저장소명>/` 접속

저장소 이름이 `<계정>.github.io`이면 `.github/workflows/daily.yml`의 `NEXT_PUBLIC_BASE_PATH` 값을 빈 문자열로 바꾼다.

## 검색 범위 바꾸기

`crawler/config.py`

| 항목 | 역할 |
| --- | --- |
| `SEARCH_QUERIES` | 각 사이트 검색창에 넣는 검색어 |
| `ROLE_TERMS` | 제목에 하나 이상 있어야 하는 직무 단어 |
| `CATEGORIES` | 분류별 도메인 단어 (위에서부터 우선) |
| `EXCLUDE_TERMS`, `HARD_EXCLUDE_TERMS` | 제외 단어 |
| `STALE_DAYS` | 이 기간 동안 다시 안 보이면 마감 추정 처리 |

링크드인 검색어는 `crawler/sources.py`의 `LINKEDIN_QUERIES`에 따로 있다.

## 사이트 구조가 바뀌었을 때

웹의 수집 현황 화면에서 실패 또는 0건으로 나오는 사이트는 `crawler/sources.py`의 `SITES` 표에서 `search_url`(검색 주소)이나 `link_pattern`(공고 상세 주소 정규식)을 고친다. 사람인과 링크드인은 같은 파일의 `crawl_saramin`, `crawl_linkedin` 함수에서 CSS 선택자를 고친다.

## 로컬 실행

```bash
pip install -r crawler/requirements.txt
python -m playwright install chromium
python crawler/main.py                      # 전체
python crawler/main.py --sites saramin      # 특정 사이트만

npm install
npm run dev                                 # http://localhost:3000
```
