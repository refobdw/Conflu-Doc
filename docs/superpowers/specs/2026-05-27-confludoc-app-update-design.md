# ConfluDoc Web App Update — Design Spec
**Date:** 2026-05-27  
**Status:** Approved

## Overview

Update the confludoc-app Expo/React Native web app to reflect the latest CLI (`conflu-editor.js`, modified 2026-05-26). Key changes: switch new document creation to Confluence Wiki Markup, replace client-side HTML preview with Confluence scratch page preview, remove Notion integration, update daily meeting section structure, and split parent page IDs by document type.

---

## Goals

- Achieve feature parity with the latest CLI version
- Remove Notion integration entirely
- No Obsidian integration (already absent from web app)
- Maintain existing Vercel deployment and CORS proxy setup

---

## Non-Goals

- Obsidian / ADF markdown export (CLI-only feature)
- Parent page selection UI (env var only, no in-app search)
- Any new screens or tabs

---

## File Change Map

### Modified
| File | Change |
|------|--------|
| `app.config.ts` | Add `CONFLUENCE_PARENT_ID_DOC`, `CONFLUENCE_PARENT_ID_DAILY` env vars |
| `src/config.ts` | Add `parentIdDoc`, `parentIdDaily`; remove `notion` fields |
| `src/api/gemini.ts` | Add `format` param, wiki system instruction, `cleanWikiMarkup()` |
| `src/api/confluence.ts` | Add `cleanHtmlForConfluence()`, update `createConfluencePage()` signature |
| `src/screens/NewDocument.tsx` | Scratch page preview flow, wiki format, remove Notion button |
| `src/screens/EditDocument.tsx` | Add `cleanHtmlForConfluence()` before AI call |
| `src/screens/DailyMeeting.tsx` | Remove 월드/전투, use `parentIdDaily`, remove Notion button |
| `src/utils/dailyMeeting.ts` | Update sections to 8 teams (remove 월드, 전투) |

### Deleted
| File | Reason |
|------|--------|
| `src/api/notion.ts` | Notion integration removed |

### Unchanged
`api/confluence-proxy.js`, `src/components/*`, `src/hooks/useLayout.ts`, `index.ts`, `vercel.json`

---

## API Layer

### `src/api/gemini.ts`

**`geminiRequest(prompt, content, history, format)`**
- Add `format: 'html' | 'wiki' = 'html'` parameter
- When `format === 'wiki'`: system instruction changes to Confluence Wiki Markup rules:
  - `h2.` / `h3.` / `h4.` for headings
  - `*` for ALL bullet points (first-level only, no `**` or `***`)
  - `*bold*` for emphasis
  - No HTML tags, no markdown, no code fences
- When `format === 'html'`: system instruction unchanged from current
- Response post-processing: call `cleanWikiMarkup()` for wiki, `cleanHtmlForConfluence()` for html

**`cleanWikiMarkup(wiki: string): string`** *(new)*
- Flatten nested bullets: `**` / `***` → `*`
- Normalize spacing: `*   text` → `* text`
- Remove blank lines between consecutive bullet lines (3 passes)

### `src/api/confluence.ts`

**`cleanHtmlForConfluence(html: string): string`** *(new)*
- Remove `<ac:*>` and `<ri:*>` Confluence macro tags
- Convert headings inside `<li>` to `<p><strong>` (Fabric editor limitation)
- Strip `<style>` and `<script>` blocks
- Extract body content if wrapped in `<body>` tags

**`createConfluencePage(title, body, parentId?, representation?)`**
- Add optional `parentId?: string` — falls back to `config.parentId` if omitted
- Add optional `representation?: 'storage' | 'wiki'` — defaults to `'storage'`
- Pass `representation` to Confluence API payload

---

## Screen Changes

### NewDocument.tsx — Full Flow Redesign

**New state:**
```ts
scratchPageId: string | null
scratchVersion: number
currentWiki: string
editHistory: { role: string; parts: { text: string }[] }[]
finalPageUrl: string | null
```

**New flow:**
1. User inputs: title (required), AI prompt, raw content
2. "AI 생성" button:
   - Calls `geminiRequest(prompt, content, [], 'wiki')` → `currentWiki`
   - Calls `createConfluencePage(scratchTitle, currentWiki, undefined, 'wiki')` where `scratchTitle = '[임시] {title}'`
   - Stores `scratchPageId`, shows "Confluence에서 미리보기" link (opens new tab)
3. Optional additional edit instructions:
   - Calls `geminiRequest(editPrompt, currentWiki, editHistory, 'wiki')`
   - Calls `updateConfluencePage(scratchPageId, scratchTitle, newWiki, scratchVersion)`
   - Updates `currentWiki`, increments `scratchVersion`
4. "최종 페이지 생성" button:
   - Calls `createConfluencePage(title, currentWiki, config.parentIdDoc, 'wiki')`
   - Calls `deleteConfluencePage(scratchPageId)`
   - Shows final `pageUrl`
5. "다시 시작" button: deletes scratch page if exists, resets all state

**Removed:** HTML preview panel (`SplitView`, `HtmlPreview`), Notion save button

### EditDocument.tsx — Minor Change

- After fetching `originalPage`, apply `cleanHtmlForConfluence(originalPage.body.storage.value)` before storing as `currentContent`
- All other logic unchanged

### DailyMeeting.tsx

- Remove `월드`, `전투` from section display and parse logic
- Replace `config.parentId` with `config.parentIdDaily` in `createConfluencePage()` call
- Remove Notion save button and all Notion import references

---

## Config / Env Changes

### `app.config.ts`
```ts
// Add:
CONFLUENCE_PARENT_ID_DOC: process.env.CONFLUENCE_PARENT_ID_DOC,
CONFLUENCE_PARENT_ID_DAILY: process.env.CONFLUENCE_PARENT_ID_DAILY,

// Remove:
NOTION_API_KEY: ...,
NOTION_DATABASE_ID: ...,
```

### `src/config.ts`
```ts
// Add to atlassian config:
parentIdDoc: Constants.expoConfig?.extra?.CONFLUENCE_PARENT_ID_DOC,
parentIdDaily: Constants.expoConfig?.extra?.CONFLUENCE_PARENT_ID_DAILY,

// Remove:
notion: { apiKey: ..., databaseId: ... }
```

---

## Daily Meeting Section Structure

**Old (10 sections):** 프로그램, 엔진, 월드, 전투, 기획, AD, PM, PD, 대표님, 공지 및 기타  
**New (8 sections):** 프로그램, 엔진, 기획, AD, PM, PD, 대표님, 공지 및 기타

Changes required in:
- `src/utils/dailyMeeting.ts`: `parseDailyInput()`, `generateDailyHTML()`, `optimizeWithAI()` JSON template
- `src/screens/DailyMeeting.tsx`: section display/input areas

---

## Error Handling

- If scratch page creation fails during "AI 생성": show error, do not hide generated wiki content (allow retry)
- If "최종 페이지 생성" fails: scratch page remains intact, show error with scratch page link
- Existing error handling patterns in EditDocument/DailyMeeting unchanged

---

## Deployment

- `.env` on Vercel: add `CONFLUENCE_PARENT_ID_DOC`, `CONFLUENCE_PARENT_ID_DAILY`; remove `NOTION_API_KEY`, `NOTION_DATABASE_ID`
- No changes to `vercel.json` or `api/confluence-proxy.js`
