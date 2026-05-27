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
