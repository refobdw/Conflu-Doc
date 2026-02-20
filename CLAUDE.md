# Conflu-Doc 프로젝트

## 개요
React Native + Expo 기반 웹앱. Confluence/Notion 문서 저장 도구.
GitHub: https://github.com/refobdw/Conflu-Doc
배포: Vercel

## 주요 구조
- `src/screens/NewDocument.tsx` - 새 문서 작성 화면 (저장하기 버튼 포함)
- `src/screens/EditDocument.tsx` - 기존 Confluence 문서 AI 편집 화면
- `src/components/ConfirmDialog.tsx` - 팝업 다이얼로그 (vertical prop 지원)
- `src/api/notion.ts` - Notion API 연동
- `src/api/confluence.ts` - Confluence API 연동
- `src/api/gemini.ts` - Gemini AI 연동
- `src/config.ts` - 환경변수 설정 (Expo Constants 사용)
- `api/confluence-proxy.js` - Vercel 서버리스 프록시 (Confluence)
- `api/notion-proxy.js` - Vercel 서버리스 프록시 (Notion)

## 저장 흐름 (현재)
1. AI 생성 버튼 → Gemini로 HTML 생성
2. 저장하기 버튼 → 팝업으로 저장 위치 선택 (Confluence / Notion / 모두 저장 / 취소)
3. 선택에 따라 각각 또는 동시에 저장

## Git 작업
- 로컬 경로: `/Users/aaron_macbook/MyDev/Conflu-Doc`
- push 시 Personal Access Token 필요 (매번 확인할 것)
