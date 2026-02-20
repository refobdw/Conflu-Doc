import { CONFIG } from '../config';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_INSTRUCTION =
  'You are a helpful assistant for Confluence documentation.\n' +
  'OUTPUT FORMAT: Return ONLY standard HTML suitable for Confluence storage format. ' +
  'Do not include markdown code blocks. Use headings, tables, bold, and lists where appropriate.';

export type GeminiTurn = {
  role: 'user' | 'model';
  parts: { text: string }[];
};

export async function geminiRequest(
  prompt: string,
  content: string,
  history: GeminiTurn[] = []
): Promise<string> {
  const url = `${GEMINI_BASE}/${CONFIG.gemini.model}:generateContent?key=${CONFIG.gemini.apiKey}`;

  let contents: GeminiTurn[];
  if (history.length > 0) {
    contents = [
      ...history,
      { role: 'user', parts: [{ text: `현재 문서:\n${content}\n\n수정 지시:\n${prompt}` }] },
    ];
  } else {
    contents = [
      { role: 'user', parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nCONTEXT:\n${content}\n\nINSTRUCTION:\n${prompt}` }] },
    ];
  }

  const body = JSON.stringify({
    contents,
    ...(history.length > 0 && { systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] } }),
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

  return candidate.content.parts[0].text
    .replace(/^```html\s*/, '')
    .replace(/\s*```$/, '');
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
