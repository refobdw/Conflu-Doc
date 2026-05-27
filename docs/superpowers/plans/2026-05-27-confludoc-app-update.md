# ConfluDoc Web App Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the latest CLI (`conflu-editor.js`, 2026-05-26) features to the Expo/React Native web app — switching new document creation to Wiki Markup with Confluence scratch-page preview, removing Notion integration, and updating daily meeting sections.

**Architecture:** Surgical file-by-file updates following existing patterns. No new files created. `notion.ts` deleted. `NewDocument.tsx` redesigned around a 3-phase flow (input → scratch → done); all other screens receive minimal targeted changes.

**Tech Stack:** React Native / Expo, TypeScript, Confluence REST API v1, Google Gemini API, Vercel serverless proxy

---

### Task 1: Config — split parent IDs, remove Notion

**Files:**
- Modify: `app.config.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Update `app.config.ts`**

Replace the entire `extra` block:

```ts
  extra: {
    atlassianEmail: process.env.ATLASSIAN_EMAIL,
    atlassianApiToken: process.env.ATLASSIAN_API_TOKEN,
    atlassianBaseUrl: process.env.ATLASSIAN_BASE_URL,
    confluenceSpaceKey: process.env.CONFLUENCE_SPACE_KEY,
    confluenceParentId: process.env.CONFLUENCE_PARENT_ID,
    confluenceParentIdDoc: process.env.CONFLUENCE_PARENT_ID_DOC,
    confluenceParentIdDaily: process.env.CONFLUENCE_PARENT_ID_DAILY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
```

(Remove `notionApiKey` and `notionDatabaseId`; keep `confluenceParentId` as fallback.)

- [ ] **Step 2: Update `src/config.ts`**

Replace the entire file:

```ts
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const CONFIG = {
  atlassian: {
    email: extra.atlassianEmail as string,
    apiToken: extra.atlassianApiToken as string,
    baseUrl: extra.atlassianBaseUrl as string,
    spaceKey: extra.confluenceSpaceKey as string,
    parentId: extra.confluenceParentId as string,
    parentIdDoc: (extra.confluenceParentIdDoc ?? extra.confluenceParentId) as string,
    parentIdDaily: (extra.confluenceParentIdDaily ?? extra.confluenceParentId) as string,
  },
  gemini: {
    apiKey: extra.geminiApiKey as string,
    model: (extra.geminiModel as string) || 'gemini-2.5-flash',
  },
};

export const getAuth = () =>
  'Basic ' + btoa(`${CONFIG.atlassian.email}:${CONFIG.atlassian.apiToken}`);
```

- [ ] **Step 3: Commit**

```bash
git add app.config.ts src/config.ts
git commit -m "config: split parentIdDoc/parentIdDaily, remove Notion config"
```

---

### Task 2: `confluence.ts` — add helpers, update signatures

**Files:**
- Modify: `src/api/confluence.ts`

- [ ] **Step 1: Replace `src/api/confluence.ts` with updated version**

```ts
import { Platform } from 'react-native';
import { CONFIG, getAuth } from '../config';

const IS_WEB = Platform.OS === 'web';

function apiUrl(path: string, query?: Record<string, string>): string {
  if (IS_WEB) {
    const params = new URLSearchParams({ _path: path, ...query });
    return `/api/confluence-proxy?${params.toString()}`;
  }
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  return `https://${CONFIG.atlassian.baseUrl}/wiki/rest/api/${path}${qs}`;
}

function apiHeaders(): Record<string, string> {
  const base: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (!IS_WEB) base['Authorization'] = getAuth();
  return base;
}

export function cleanHtmlForConfluence(html: string): string {
  if (!html) return '';
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) html = bodyMatch[1];
  html = html.replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, (match, tag, content, offset) => {
    const before = html.slice(0, offset);
    const openLi = before.lastIndexOf('<li');
    const closeLi = before.lastIndexOf('</li>');
    if (openLi !== -1 && openLi > closeLi) return `<p><strong>${content}</strong></p>`;
    return match;
  });
  html = html.replace(/<ac:[^>]*>[\s\S]*?<\/ac:[^>]+>/gi, '');
  html = html.replace(/<ac:[^/]*\/>/gi, '');
  html = html.replace(/<ri:[^/]*\/>/gi, '');
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  return html.trim();
}

export type ConfluencePage = {
  id: string;
  title: string;
  version: { number: number };
  body?: { storage?: { value: string } };
};

export async function getConfluencePage(pageId: string): Promise<ConfluencePage> {
  const res = await fetch(
    apiUrl(`content/${pageId}`, { expand: 'body.storage,version' }),
    { headers: apiHeaders() }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`페이지 조회 실패 (${res.status}): ${json.message ?? ''}`);
  return json;
}

export async function createConfluencePage(
  title: string,
  body: string,
  parentId?: string,
  representation: 'storage' | 'wiki' = 'storage'
): Promise<ConfluencePage> {
  const payload = {
    type: 'page',
    title,
    space: { key: CONFIG.atlassian.spaceKey },
    ancestors: [{ id: parentId ?? CONFIG.atlassian.parentId }],
    body: { storage: { value: body, representation } },
  };
  const res = await fetch(apiUrl('content'), {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`페이지 생성 실패: ${res.status} - ${JSON.stringify(json)}`);
  return json;
}

export async function updateConfluencePage(
  pageId: string,
  title: string,
  body: string,
  version: number,
  representation: 'storage' | 'wiki' = 'storage'
): Promise<ConfluencePage> {
  const payload = {
    type: 'page',
    title,
    body: { storage: { value: body, representation } },
    version: { number: version + 1 },
  };
  const res = await fetch(apiUrl(`content/${pageId}`), {
    method: 'PUT',
    headers: apiHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`페이지 업데이트 실패: ${res.status}`);
  return json;
}

export async function deleteConfluencePage(pageId: string): Promise<void> {
  const res = await fetch(apiUrl(`content/${pageId}`), {
    method: 'DELETE',
    headers: IS_WEB ? {} : { Authorization: getAuth() },
  });
  if (!res.ok) throw new Error(`페이지 삭제 실패: ${res.status}`);
}

export async function searchConfluenceByTitle(title: string): Promise<ConfluencePage[]> {
  const res = await fetch(
    apiUrl('content', { title, spaceKey: CONFIG.atlassian.spaceKey, expand: 'version' }),
    { headers: apiHeaders() }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`검색 실패 (${res.status})`);
  return json.results ?? [];
}

export function extractPageId(input: string): string | null {
  const match = input.match(/\/pages\/(\d+)/);
  if (match) return match[1];
  if (/^\d+$/.test(input.trim())) return input.trim();
  return null;
}

export function getPageUrl(pageId: string): string {
  return `https://${CONFIG.atlassian.baseUrl}/wiki/spaces/${CONFIG.atlassian.spaceKey}/pages/${pageId}`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `src/api/confluence.ts`

- [ ] **Step 3: Commit**

```bash
git add src/api/confluence.ts
git commit -m "feat(confluence): add cleanHtmlForConfluence, wiki representation support"
```

---

### Task 3: `gemini.ts` — wiki format support

**Files:**
- Modify: `src/api/gemini.ts`

- [ ] **Step 1: Replace `src/api/gemini.ts` with updated version**

```ts
import { CONFIG } from '../config';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_HTML =
  'You are a helpful assistant for Confluence documentation.\n' +
  'OUTPUT FORMAT: Return ONLY valid HTML. Rules:\n' +
  '- Use h2/h3 for section titles at the TOP LEVEL only — NEVER inside li tags\n' +
  '- Use ul/li for bullet points that contain plain text only\n' +
  '- Correct structure: <h2>Section</h2><ul><li>item</li></ul>\n' +
  '- WRONG structure: <ul><li><h2>Section</h2><ul>...</ul></li></ul>\n' +
  '- Do NOT use ac:* or ri:* tags\n' +
  '- Do NOT wrap in html/head/body tags\n' +
  '- Do NOT include markdown code fences';

const SYSTEM_WIKI =
  'You are a helpful assistant for Confluence documentation.\n' +
  'Return ONLY Confluence Wiki Markup. Rules:\n' +
  '- h2. for main section titles\n' +
  '- h3. for subsection titles\n' +
  '- h4. for sub-subsection titles\n' +
  '- * for ALL bullet points — use ONLY first-level bullets, do NOT use ** or ***\n' +
  '- *bold text* for emphasis (e.g. *label*: description)\n' +
  '- No nested bullets. No HTML tags. No markdown. No code fences.';

export function cleanWikiMarkup(wiki: string): string {
  if (!wiki) return '';
  wiki = wiki.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  wiki = wiki.replace(/^\*{2,}[ \t]*/gm, '* ');
  wiki = wiki.replace(/^(\*+)[ \t]+/gm, '$1 ');
  for (let i = 0; i < 3; i++) {
    wiki = wiki.replace(/(\*[^\n]+)\n\n+(\*)/g, '$1\n$2');
  }
  return wiki.trim();
}

export type GeminiTurn = {
  role: 'user' | 'model';
  parts: { text: string }[];
};

export async function geminiRequest(
  prompt: string,
  content: string,
  history: GeminiTurn[] = [],
  format: 'html' | 'wiki' = 'html'
): Promise<string> {
  const url = `${GEMINI_BASE}/${CONFIG.gemini.model}:generateContent?key=${CONFIG.gemini.apiKey}`;
  const systemInstruction = format === 'wiki' ? SYSTEM_WIKI : SYSTEM_HTML;

  let contents: GeminiTurn[];
  if (history.length > 0) {
    contents = [
      ...history,
      { role: 'user', parts: [{ text: `현재 문서:\n${content}\n\n수정 지시:\n${prompt}` }] },
    ];
  } else {
    contents = [
      { role: 'user', parts: [{ text: `${systemInstruction}\n\nCONTEXT:\n${content}\n\nINSTRUCTION:\n${prompt}` }] },
    ];
  }

  const body = JSON.stringify({
    contents,
    ...(history.length > 0 && { systemInstruction: { parts: [{ text: systemInstruction }] } }),
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
  });

  if (!res.ok) throw new Error(`Gemini 오류: ${res.status}`);

  const json = await res.json();
  const candidate = json.candidates?.[0];
  if (!candidate?.content?.parts?.[0]) {
    const reason = candidate?.finishReason ?? json.promptFeedback?.blockReason ?? '알 수 없음';
    throw new Error(`Gemini 응답이 비어있습니다 (사유: ${reason})`);
  }

  let text: string = candidate.content.parts[0].text;
  const fenceMatch = text.match(/```(?:wiki|html)?\s*\n([\s\S]*?)\n\s*```/);
  text = fenceMatch ? fenceMatch[1] : text.replace(/^```(?:wiki|html)?\s*/m, '').replace(/\s*```\s*$/m, '');

  return format === 'wiki' ? cleanWikiMarkup(text) : text;
}

export async function geminiRequestRaw(promptText: string, retries = 3): Promise<string> {
  const url = `${GEMINI_BASE}/${CONFIG.gemini.model}:generateContent?key=${CONFIG.gemini.apiKey}`;
  const body = JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] });

  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body,
    });

    if (res.ok) {
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini 응답이 비어있습니다');
      return text;
    }

    if ([429, 500, 503].includes(res.status) && i < retries - 1) {
      await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
      continue;
    }

    throw new Error(`Gemini 오류: ${res.status}`);
  }

  throw new Error('Gemini API 최대 재시도 횟수 초과');
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `src/api/gemini.ts`

- [ ] **Step 3: Commit**

```bash
git add src/api/gemini.ts
git commit -m "feat(gemini): add wiki format support and cleanWikiMarkup"
```

---

### Task 4: `dailyMeeting.ts` — update sections (add 기획, remove 월드/전투)

**Files:**
- Modify: `src/utils/dailyMeeting.ts`

- [ ] **Step 1: Replace `src/utils/dailyMeeting.ts` with updated version**

```ts
import { geminiRequestRaw } from '../api/gemini';

export type DailySections = Record<string, string[]>;

const SECTION_KEYS = ['프로그램', '엔진', '기획', 'AD', 'PM', 'PD', '대표님', '공지 및 기타'];

export function parseDailyInput(inputText: string): DailySections {
  const sections: DailySections = Object.fromEntries(SECTION_KEYS.map((k) => [k, []]));
  let currentSection: string | null = null;

  for (const line of inputText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const header = trimmed.replace(/^###\s*/, '').trim();
    let found: string | null = null;
    if (header.includes('프로그램')) found = '프로그램';
    else if (header.includes('엔진')) found = '엔진';
    else if (header.includes('기획')) found = '기획';
    else if (header.includes('아트') || header.includes('AD')) found = 'AD';
    else if (header.includes('PM')) found = 'PM';
    else if (header.includes('PD')) found = 'PD';
    else if (header.includes('대표님') || header.includes('경영진')) found = '대표님';
    else if (header.includes('공지') || header.includes('기타')) found = '공지 및 기타';

    if (found && (trimmed.startsWith('###') || SECTION_KEYS.includes(trimmed))) {
      currentSection = found;
      continue;
    }
    if (currentSection) sections[currentSection].push(line);
  }
  return sections;
}

export function generateDailyHTML(sections: DailySections): string {
  const rows = SECTION_KEYS.map((key) => {
    const items = sections[key] ?? [];
    const listItems = items.filter(Boolean).map((l) => `<li>${l.trim()}</li>`).join('');
    return `<tr><td><b>${key}</b></td><td><ul>${listItems}</ul></td></tr>`;
  }).join('');
  return `<table><thead><tr><th>팀</th><th>Doing</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export async function optimizeWithAI(sections: DailySections): Promise<DailySections> {
  const prompt = `당신은 유능한 PM입니다. 입력된 회의록 내용을 **[작성 규칙]**에 따라 정리하여 **JSON 형식**으로 응답하십시오.

### [작성 규칙]
1. 철저한 **개조식** 문장을 사용합니다.
2. 문장의 끝은 반드시 **'~ 진행 중', '~ 함', '~ 음', '~ 예정', '~ 것'** 등 명사형이나 진행형으로 끝맺으십시오.
3. 각 항목의 시작은 반드시 \`- **주제:** 내용\` 형식이어야 합니다.
4. 게임 개발 전문 용어는 그대로 사용하십시오.

### [응답 형식]
반드시 아래와 같은 JSON 구조로만 답변하십시오. 다른 설명이나 텍스트는 일체 제외하십시오.
{"프로그램":[],"엔진":[],"기획":[],"AD":[],"PM":[],"PD":[],"대표님":[],"공지 및 기타":[]}

**주의:** 입력된 "아트"는 "AD" 키에, "경영진"은 "대표님" 키에 매핑하십시오.

입력 내용:
${JSON.stringify(sections, null, 2)}`;

  try {
    const response = await geminiRequestRaw(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return sections;
    const optimized = JSON.parse(jsonMatch[0]);
    const result = { ...sections };
    for (const key of SECTION_KEYS) {
      if (Array.isArray(optimized[key])) result[key] = optimized[key];
    }
    return result;
  } catch {
    return sections;
  }
}

export function getDailyTitle(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}/${mm}/${dd}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/dailyMeeting.ts
git commit -m "feat(daily): replace 월드/전투 with 기획, restore full AI prompt"
```

---

### Task 5: `DailyMeeting.tsx` — use parentIdDaily, remove Notion

**Files:**
- Modify: `src/screens/DailyMeeting.tsx`

- [ ] **Step 1: Replace `src/screens/DailyMeeting.tsx` with updated version**

```tsx
import React, { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SplitView } from '../components/SplitView';
import { HtmlPreview } from '../components/HtmlPreview';
import { ConfirmDialog, DialogButton } from '../components/ConfirmDialog';
import { useLayout } from '../hooks/useLayout';
import { parseDailyInput, generateDailyHTML, optimizeWithAI, getDailyTitle } from '../utils/dailyMeeting';
import {
  createConfluencePage, searchConfluenceByTitle,
  updateConfluencePage, getPageUrl,
} from '../api/confluence';
import { CONFIG } from '../config';

type AlertState = { visible: boolean; title: string; message: string; buttons: DialogButton[] };
const CLOSED: AlertState = { visible: false, title: '', message: '', buttons: [] };

export function DailyMeetingScreen() {
  const { isTablet } = useLayout();
  const [title, setTitle] = useState(getDailyTitle());
  const [content, setContent] = useState('');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [alert, setAlert] = useState<AlertState>(CLOSED);

  const showAlert = (title: string, message: string, buttons?: DialogButton[]) =>
    setAlert({ visible: true, title, message, buttons: buttons ?? [{ text: '확인', onPress: () => setAlert(CLOSED) }] });

  async function handleGenerate() {
    if (!content.trim()) { showAlert('오류', '회의록 내용을 입력해주세요.'); return; }
    setLoading(true);
    setStatus('파싱 및 AI 최적화 중...');
    try {
      let sections = parseDailyInput(content);
      sections = await optimizeWithAI(sections);
      const result = generateDailyHTML(sections);
      setHtml(result);
      setStatus('생성 완료! 미리보기를 확인하세요.');
    } catch (e: any) {
      showAlert('오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (!html) { showAlert('오류', '먼저 회의록을 생성해주세요.'); return; }
    setLoading(true);
    setStatus('Confluence에 업로드 중...');
    try {
      const existing = await searchConfluenceByTitle(title);
      let pageId: string;
      if (existing.length > 0) {
        const page = existing[0];
        await updateConfluencePage(page.id, title, html, page.version.number);
        pageId = page.id;
      } else {
        const page = await createConfluencePage(title, html, CONFIG.atlassian.parentIdDaily);
        pageId = page.id;
      }
      const url = getPageUrl(pageId);
      setStatus(`완료! ${url}`);
      showAlert('업로드 완료', url);
    } catch (e: any) {
      showAlert('오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  const inputPanel = (
    <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
      <Text style={styles.label}>날짜 제목</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="YY/MM/DD" />

      <Text style={styles.label}>회의록 내용</Text>
      <TextInput
        style={[styles.input, styles.multiline]} value={content} onChangeText={setContent}
        placeholder={'### 프로그램\n- 작업 내용\n\n### 엔진\n- 작업 내용\n\n### 기획\n- 작업 내용'}
        multiline numberOfLines={12}
      />

      {status ? <Text style={styles.status}>{status}</Text> : null}
      {loading && <ActivityIndicator style={{ marginVertical: 8 }} />}

      <TouchableOpacity style={styles.btn} onPress={handleGenerate} disabled={loading}>
        <Text style={styles.btnText}>회의록 생성</Text>
      </TouchableOpacity>

      {!isTablet && html ? (
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => setPreviewVisible(true)}>
          <Text style={styles.btnText}>미리보기 ▶</Text>
        </TouchableOpacity>
      ) : null}

      {html ? (
        <TouchableOpacity style={[styles.btn, styles.btnSuccess]} onPress={handleUpload} disabled={loading}>
          <Text style={styles.btnText}>Confluence 업로드</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );

  return (
    <>
      <SplitView left={inputPanel} right={<HtmlPreview html={html} />} />
      {!isTablet && (
        <HtmlPreview html={html} asModal visible={previewVisible} onClose={() => setPreviewVisible(false)} />
      )}
      <ConfirmDialog
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        buttons={alert.buttons}
      />
    </>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: '#fff' },
  panelContent: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#172B4D', marginBottom: 4, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 10, fontSize: 14, backgroundColor: '#fafafa' },
  multiline: { height: 200, textAlignVertical: 'top' },
  status: { fontSize: 12, color: '#666', marginTop: 8 },
  btn: { backgroundColor: '#0052CC', borderRadius: 6, padding: 14, alignItems: 'center', marginTop: 12 },
  btnSecondary: { backgroundColor: '#6554C0' },
  btnSuccess: { backgroundColor: '#00875A' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `src/screens/DailyMeeting.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/screens/DailyMeeting.tsx
git commit -m "feat(daily): use parentIdDaily, remove Notion, update placeholder"
```

---

### Task 6: `EditDocument.tsx` — apply cleanHtmlForConfluence before AI

**Files:**
- Modify: `src/screens/EditDocument.tsx`

- [ ] **Step 1: Add `cleanHtmlForConfluence` import**

In `src/screens/EditDocument.tsx`, change the confluence import line (line 11–14):

```ts
import {
  getConfluencePage, createConfluencePage, updateConfluencePage,
  deleteConfluencePage, extractPageId, getPageUrl, cleanHtmlForConfluence,
} from '../api/confluence';
```

- [ ] **Step 2: Apply `cleanHtmlForConfluence` on page load**

In `handleLoadPage()`, change lines 51–56:

```ts
      const page = await getConfluencePage(pageId);
      const rawContent = page.body?.storage?.value ?? '';
      const content = cleanHtmlForConfluence(rawContent);
      setOriginalContent(content);
      setOriginalTitle(page.title);
      setOriginalPageId(pageId);
      setHtml(content);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/screens/EditDocument.tsx
git commit -m "fix(edit): sanitize fetched Confluence HTML before AI processing"
```

---

### Task 7: `NewDocument.tsx` — redesign with scratch page flow

**Files:**
- Modify: `src/screens/NewDocument.tsx`

- [ ] **Step 1: Replace `src/screens/NewDocument.tsx` with the new 3-phase design**

```tsx
import React, { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { ConfirmDialog, DialogButton } from '../components/ConfirmDialog';
import { geminiRequest, GeminiTurn } from '../api/gemini';
import {
  createConfluencePage, updateConfluencePage,
  deleteConfluencePage, getPageUrl,
} from '../api/confluence';
import { CONFIG } from '../config';

const MAX_FULL_TURNS = 2;

type Phase = 'input' | 'scratch' | 'done';
type AlertState = { visible: boolean; title: string; message: string; buttons: DialogButton[] };
const CLOSED: AlertState = { visible: false, title: '', message: '', buttons: [] };

export function NewDocumentScreen() {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [content, setContent] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [alert, setAlert] = useState<AlertState>(CLOSED);

  const [currentWiki, setCurrentWiki] = useState('');
  const [scratchPageId, setScratchPageId] = useState('');
  const [scratchTitle, setScratchTitle] = useState('');
  const [scratchVersion, setScratchVersion] = useState(1);
  const [editInstruction, setEditInstruction] = useState('');
  const [editInstructions, setEditInstructions] = useState<string[]>([]);
  const [recentTurns, setRecentTurns] = useState<{ user: GeminiTurn; model: GeminiTurn }[]>([]);
  const [finalPageUrl, setFinalPageUrl] = useState('');

  const showAlert = (title: string, message: string, buttons?: DialogButton[]) =>
    setAlert({ visible: true, title, message, buttons: buttons ?? [{ text: '확인', onPress: () => setAlert(CLOSED) }] });

  async function handleGenerate() {
    if (!title.trim() || !content.trim()) {
      showAlert('오류', '제목과 내용을 입력해주세요.');
      return;
    }
    setLoading(true);
    setStatus('AI가 문서를 처리하는 중...');
    try {
      const wiki = await geminiRequest(
        prompt || '문서를 Confluence 형식으로 정리해주세요.',
        content,
        [],
        'wiki'
      );
      setCurrentWiki(wiki);

      const st = `[임시] ${title} - ${new Date().toLocaleString('ko-KR')}`;
      setScratchTitle(st);
      setStatus('임시 페이지 생성 중...');
      const scratch = await createConfluencePage(st, wiki, undefined, 'wiki');
      setScratchPageId(scratch.id);
      setScratchVersion(scratch.version?.number ?? 1);
      setPhase('scratch');
      setStatus('임시 페이지가 생성되었습니다. 아래 링크에서 미리보기 하세요.');
    } catch (e: any) {
      showAlert('오류', e.message);
      setStatus('');
    } finally {
      setLoading(false);
    }
  }

  function buildHistory(): GeminiTurn[] {
    const history: GeminiTurn[] = [
      { role: 'user', parts: [{ text: `다음은 편집할 원본 Confluence 문서입니다:\n${currentWiki}` }] },
      { role: 'model', parts: [{ text: '문서를 확인했습니다. 수정 지시를 해주세요.' }] },
    ];
    const summarizedCount = editInstructions.length - recentTurns.length;
    if (summarizedCount > 0) {
      const summary = editInstructions.slice(0, summarizedCount).map((inst, i) => `${i + 1}. ${inst}`).join('\n');
      history.push({ role: 'user', parts: [{ text: `지금까지 적용된 수정 이력:\n${summary}` }] });
      history.push({ role: 'model', parts: [{ text: '이전 수정 이력을 확인했습니다.' }] });
    }
    for (const turn of recentTurns) {
      history.push(turn.user);
      history.push(turn.model);
    }
    return history;
  }

  async function handleAdditionalEdit() {
    if (!editInstruction.trim()) return;
    setLoading(true);
    setStatus('AI가 수정하는 중...');
    try {
      const history = buildHistory();
      const newWiki = await geminiRequest(editInstruction, currentWiki, history, 'wiki');

      const newTurn = {
        user: { role: 'user' as const, parts: [{ text: `현재 문서:\n${currentWiki}\n\n수정 지시:\n${editInstruction}` }] },
        model: { role: 'model' as const, parts: [{ text: newWiki }] },
      };
      setRecentTurns([...recentTurns, newTurn].slice(-MAX_FULL_TURNS));
      setEditInstructions([...editInstructions, editInstruction]);
      setCurrentWiki(newWiki);
      setEditInstruction('');

      const updated = await updateConfluencePage(scratchPageId, scratchTitle, newWiki, scratchVersion, 'wiki');
      setScratchVersion(updated.version?.number ?? scratchVersion + 1);
      setStatus('수정 완료! 임시 페이지에서 미리보기를 확인하세요.');
    } catch (e: any) {
      showAlert('수정 오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setLoading(true);
    setStatus('최종 페이지를 생성하는 중...');
    try {
      const page = await createConfluencePage(title, currentWiki, CONFIG.atlassian.parentIdDoc, 'wiki');
      const url = getPageUrl(page.id);
      try { await deleteConfluencePage(scratchPageId); } catch {}
      setFinalPageUrl(url);
      setPhase('done');
      setStatus(`완료! ${url}`);
    } catch (e: any) {
      showAlert('생성 오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    if (scratchPageId) {
      try { await deleteConfluencePage(scratchPageId); } catch {}
    }
    setTitle('');
    setPrompt('');
    setContent('');
    setCurrentWiki('');
    setScratchPageId('');
    setScratchTitle('');
    setScratchVersion(1);
    setEditInstruction('');
    setEditInstructions([]);
    setRecentTurns([]);
    setFinalPageUrl('');
    setPhase('input');
    setStatus('');
  }

  return (
    <>
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        {phase === 'input' && (
          <>
            <Text style={styles.label}>제목</Text>
            <TextInput
              style={styles.input} value={title} onChangeText={setTitle}
              placeholder="문서 제목"
            />

            <Text style={styles.label}>AI 프롬프트</Text>
            <TextInput
              style={styles.input} value={prompt} onChangeText={setPrompt}
              placeholder="예: 개발 가이드 형식으로 정리해주세요"
            />

            <Text style={styles.label}>내용</Text>
            <TextInput
              style={[styles.input, styles.multiline]} value={content} onChangeText={setContent}
              placeholder="문서 내용을 입력하세요..." multiline numberOfLines={8}
            />

            {status ? <Text style={styles.status}>{status}</Text> : null}
            {loading && <ActivityIndicator style={{ marginVertical: 8 }} />}

            <TouchableOpacity style={styles.btn} onPress={handleGenerate} disabled={loading}>
              <Text style={styles.btnText}>AI 생성</Text>
            </TouchableOpacity>
          </>
        )}

        {phase === 'scratch' && (
          <>
            <Text style={styles.sectionTitle}>임시 페이지 미리보기</Text>
            <TouchableOpacity onPress={() => Linking.openURL(getPageUrl(scratchPageId))}>
              <Text style={styles.link}>Confluence에서 미리보기 →</Text>
            </TouchableOpacity>

            <Text style={[styles.label, { marginTop: 20 }]}>추가 수정 (선택)</Text>
            <TextInput
              style={[styles.input, styles.editArea]} value={editInstruction} onChangeText={setEditInstruction}
              placeholder="수정 지시사항 입력..." multiline numberOfLines={4}
            />

            {status ? <Text style={styles.status}>{status}</Text> : null}
            {loading && <ActivityIndicator style={{ marginVertical: 8 }} />}

            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={handleAdditionalEdit}
              disabled={loading || !editInstruction.trim()}
            >
              <Text style={styles.btnText}>추가 수정</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.btnSuccess]} onPress={handleCreate} disabled={loading}>
              <Text style={styles.btnText}>최종 페이지 생성</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleReset} disabled={loading}>
              <Text style={styles.btnText}>다시 시작</Text>
            </TouchableOpacity>
          </>
        )}

        {phase === 'done' && (
          <>
            <Text style={styles.sectionTitle}>페이지 생성 완료!</Text>
            <TouchableOpacity onPress={() => Linking.openURL(finalPageUrl)}>
              <Text style={styles.link}>{finalPageUrl}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, { marginTop: 24 }]} onPress={handleReset}>
              <Text style={styles.btnText}>새 문서 작성</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      <ConfirmDialog
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        buttons={alert.buttons}
      />
    </>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: '#fff' },
  panelContent: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#172B4D', marginBottom: 4, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 10, fontSize: 14, backgroundColor: '#fafafa' },
  multiline: { height: 140, textAlignVertical: 'top' },
  editArea: { height: 100, textAlignVertical: 'top' },
  status: { fontSize: 12, color: '#666', marginTop: 8 },
  btn: { backgroundColor: '#0052CC', borderRadius: 6, padding: 14, alignItems: 'center', marginTop: 12 },
  btnSecondary: { backgroundColor: '#6554C0' },
  btnSuccess: { backgroundColor: '#00875A' },
  btnDanger: { backgroundColor: '#DE350B' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#172B4D', marginBottom: 8 },
  link: { color: '#0052CC', fontSize: 14, textDecorationLine: 'underline', marginVertical: 4 },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If you see errors about `SplitView`, `HtmlPreview`, or `useLayout` — they are correct: those imports were removed intentionally.

- [ ] **Step 3: Commit**

```bash
git add src/screens/NewDocument.tsx
git commit -m "feat(new-doc): replace HTML preview with Confluence scratch page flow"
```

---

### Task 8: Delete `notion.ts`

**Files:**
- Delete: `src/api/notion.ts`

- [ ] **Step 1: Delete the file**

```bash
git rm src/api/notion.ts
```

- [ ] **Step 2: Final TypeScript check — confirm no remaining Notion imports**

```bash
npx tsc --noEmit
```

Expected: clean compile with no errors. If any file still imports from `../api/notion`, fix that import now.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove Notion integration"
```

---

### Task 9: Push and update Vercel env vars

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Add new env vars on Vercel dashboard**

Go to: Vercel → confludoc-app project → Settings → Environment Variables

Add:
- `CONFLUENCE_PARENT_ID_DOC` — parent page ID for new documents
- `CONFLUENCE_PARENT_ID_DAILY` — parent page ID for daily meeting notes

Remove (optional, app still uses as fallback):
- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`

- [ ] **Step 3: Trigger redeploy**

Either push an empty commit or click "Redeploy" in the Vercel dashboard.

```bash
git commit --allow-empty -m "chore: trigger vercel redeploy"
git push origin main
```

- [ ] **Step 4: Smoke test on deployed URL**

1. Open deployed app → **새 문서 탭**
   - Input title + content → "AI 생성" → status shows "임시 페이지 생성 중..."
   - "Confluence에서 미리보기 →" link opens Confluence page with wiki-formatted content
   - "최종 페이지 생성" → success message with URL, page appears under `CONFLUENCE_PARENT_ID_DOC`

2. **문서 수정 탭** — load an existing page → Confirm page loads and AI edits work

3. **데일리 회의록 탭**
   - Paste content with `### 기획` header → Confirm it parses correctly
   - Confirm 월드/전투 rows are gone from generated table
   - Upload → page appears under `CONFLUENCE_PARENT_ID_DAILY`
