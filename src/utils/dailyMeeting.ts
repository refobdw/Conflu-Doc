import { geminiRequestRaw } from '../api/gemini';

export type DailySections = Record<string, string[]>;

const SECTION_KEYS = ['프로그램', '엔진', '월드', '전투', 'AD', 'PM', 'PD', '대표님', '공지 및 기타'];

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
    else if (header.includes('월드')) found = '월드';
    else if (header.includes('전투')) found = '전투';
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
  const prompt = `당신은 유능한 PM입니다. 입력된 회의록 내용을 정리하여 JSON 형식으로 응답하십시오.
규칙: 개조식 문장, 명사형 어미, \`- **주제:** 내용\` 형식.
반드시 아래 JSON 구조로만 답변하십시오:
{"프로그램":[],"엔진":[],"월드":[],"전투":[],"AD":[],"PM":[],"PD":[],"대표님":[],"공지 및 기타":[]}

입력:
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
