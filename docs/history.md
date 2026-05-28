# ConfluDoc App — 개발 히스토리

---

## 2026-05-27~28 | CLI 최신 기능 웹앱 반영 + 배포 후 버그 수정

### 완료된 작업
- **`app.config.ts`**: `CONFLUENCE_PARENT_ID_DOC`, `CONFLUENCE_PARENT_ID_DAILY` 환경변수 추가; Notion 관련 env 제거
- **`src/config.ts`**: `parentIdDoc`, `parentIdDaily` 추가 (레거시 `parentId` 폴백 포함); Notion config 제거
- **`src/api/confluence.ts`**: `cleanHtmlForConfluence()` 추가; `createConfluencePage` / `updateConfluencePage`에 `representation` 파라미터 추가
- **`src/api/gemini.ts`**: `format: 'html' | 'wiki'` 파라미터 추가; `SYSTEM_WIKI` 시스템 지시문 추가; `cleanWikiMarkup()` 추가
- **`src/utils/dailyMeeting.ts`**: 섹션 8개로 변경 (월드/전투 제거, 기획 추가); `formatItem()` 추가 (`-` 제거, `**bold**` → `<b>`); AI 프롬프트에 주제 예시 추가
- **`src/screens/DailyMeeting.tsx`**: `parentIdDaily` 사용; Notion 제거; 중복 제목 시 `(n)` suffix 생성; 완료 후 `<a>` 링크 표시
- **`src/screens/EditDocument.tsx`**: 페이지 로드 시 `cleanHtmlForConfluence()` 적용
- **`src/screens/NewDocument.tsx`**: 전면 재설계 — HTML 미리보기 제거, Wiki Markup + Confluence scratch page 플로우; 중복 제목 시 `(n)` suffix 생성; 외부 링크 `<a>` 태그로 처리
- **`src/api/notion.ts`**: 삭제

### 주요 버그 수정
| 증상 | 원인 | 해결 |
|------|------|------|
| scratch page 생성 시 404 | `undefined` parentId → 레거시 `CONFLUENCE_PARENT_ID` 폴백 (유효하지 않음) | scratch page도 `parentIdDoc` 명시 사용 |
| Confluence 링크 클릭 무반응 | `Linking.openURL` / `window.open`이 PWA Modal 내에서 팝업 차단됨 | 모든 외부 링크를 `<a href target="_blank">` 태그로 교체 |
| 회의록 항목에 `주제:` 글자 그대로 출력 | AI 프롬프트에 예시 없어 "주제"를 변수명 아닌 리터럴로 해석 | 프롬프트에 `예: "인물정보 UI/UX..." → "**인물정보:** ..."` 예시 추가 |
| 회의록 항목에 `-` 기호와 `**bold**` 그대로 출력 | `generateDailyHTML`이 raw 문자열을 `<li>`에 그대로 삽입 | `formatItem()` 추가: `-` 제거 + `**...**` → `<b>` 변환 |
| 신규 페이지가 기존 동명 페이지를 덮어씀 | DailyMeeting이 `searchConfluenceByTitle` 후 update 호출 | 중복 시 `(1)`, `(2)` suffix로 신규 생성 (NewDocument도 동일 적용) |
| Vercel 재배포 후 코드 미반영 | "Redeploy" 버튼이 이전 빌드를 재사용 | 빈 커밋 push로 새 빌드 트리거 |

### 결정 사항
- **Wiki Markup 유지 (새 문서)**: HTML 인앱 미리보기 포기 대신 Confluence scratch page로 100% 정확한 WYSIWYG 미리보기 제공. CLI와 포맷 통일.
- **Force push 선택**: remote에 MacBook에서 push된 부분 구현 커밋 5개가 있었으나, 로컬 작업이 완전한 상위 호환이므로 rebase 대신 force push.
- **외부 링크는 항상 `<a>` 태그**: React Native Web + PWA 환경에서 `window.open` / `Linking.openURL`은 Modal 안에서 팝업 차단에 걸림. `<a href target="_blank">`만 신뢰할 수 있음.

### 개선 아이디어 (다음 세션 후보)
- [x] `NewDocument.tsx`의 `openExternal` 함수 제거 (미사용 dead code, import 위치도 잘못됨)
- [x] `DailyMeeting.tsx`에서 `updateConfluencePage` import 제거 (더 이상 사용 안 함)
- [x] `uploadedUrl` 상태를 `handleGenerate` 호출 시 초기화 (새 회의록 생성 시 이전 링크가 남아있음)
- [ ] 중복 제목 suffix 탐색이 API 호출 N번 — 실용적으론 문제없으나 개선 가능
- [ ] `[임시]` scratch page 누수 방지 — 브라우저 종료 시 삭제 안 됨 (beforeunload 이벤트로 정리 시도 가능)
- [ ] Vercel Sensitive 변수 저장 확인 어려움 — 주요 설정값은 non-Sensitive로 관리하거나 README에 명시

---

## 2026-05-28 | 코드 정리 (dead code 제거, UX 버그 수정)

### 완료된 작업
- **`src/screens/NewDocument.tsx`**: 미사용 `openExternal` 함수 및 잘못된 위치의 import 제거
- **`src/screens/DailyMeeting.tsx`**: 미사용 `updateConfluencePage` import 제거; `handleGenerate` 호출 시 `uploadedUrl` 초기화
