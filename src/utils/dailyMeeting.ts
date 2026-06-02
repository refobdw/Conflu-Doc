import { geminiRequestRaw } from '../api/gemini';

export type DailySections = Record<string, string[]>;

const SECTION_KEYS = ['프로그램', '엔진', '기획/PD', 'AD', 'PM', 'CCO', '대표님', '공지 및 기타'];

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
    else if (header.includes('기획')) found = '기획/PD';
    else if (header.includes('아트') || header.includes('AD')) found = 'AD';
    else if (header.includes('PM')) found = 'PM';
    else if (header.includes('PD')) found = 'CCO';
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

function formatItem(line: string): string {
  return line
    .trim()
    .replace(/^[-•]\s*/, '')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

export function generateDailyHTML(sections: DailySections): string {
  const rows = SECTION_KEYS.map((key) => {
    const items = sections[key] ?? [];
    const listItems = items.filter(Boolean).map((l) => `<li>${formatItem(l)}</li>`).join('');
    return `<tr><td><b>${key}</b></td><td><ul>${listItems}</ul></td></tr>`;
  }).join('');
  return `<table><thead><tr><th>팀</th><th>Doing</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export async function optimizeWithAI(sections: DailySections): Promise<DailySections> {
  const prompt = `당신은 유능한 PM입니다. 입력된 회의록 내용을 **[작성 규칙]**에 따라 정리하여 **JSON 형식**으로 응답하십시오.

### [작성 규칙]
1. 철저한 **개조식** 문장을 사용합니다.
2. 문장의 끝은 반드시 **'~ 진행 중', '~ 함', '~ 음', '~ 예정', '~ 것'** 등 명사형이나 진행형으로 끝맺으십시오.
3. **서식:**
   - 각 항목의 시작은 반드시 \`- **주제:** 내용\` 형식이어야 합니다.
   - '주제'에는 내용의 핵심이 담긴 키워드를 작성하세요.
   - 예: input = "인물정보 UI/UX 개발 진행 중", output = "- **인물정보:** 인물정보 UI/UX 개발 진행 중"
4. 게임 개발 전문 용어는 그대로 사용하십시오.

### [응답 형식]
반드시 아래와 같은 JSON 구조로만 답변하십시오. 다른 설명이나 텍스트는 일체 제외하십시오.
{"프로그램":["- **주제:** 내용"],"엔진":[],"기획/PD":[],"AD":[],"PM":[],"CCO":[],"대표님":[],"공지 및 기타":[]}

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
