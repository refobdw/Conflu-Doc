import { geminiRequestRaw } from '../api/gemini';

export type DailySections = Record<string, string[]>;

interface SectionDef {
  key: string;
  match: (h: string) => boolean;
}

// 배열 순서 = 테이블/AI 출력 순서, key = 표시 라벨
const SECTIONS: SectionDef[] = [
  { key: '프로그램', match: (h) => h.includes('프로그램') },
  { key: '엔진', match: (h) => h.includes('엔진') },
  { key: '아트', match: (h) => h.includes('아트') || h.includes('AD') },
  { key: '기획', match: (h) => h.includes('기획') },
  { key: 'PM', match: (h) => h.includes('PM') },
  { key: 'PD', match: (h) => h.includes('PD') },
  { key: 'CCO', match: (h) => h.includes('CCO') },
  { key: '대표님', match: (h) => h.includes('대표님') || h.includes('경영진') },
  { key: '기타', match: (h) => h.includes('기타') || h.includes('공지') },
];
const SECTION_KEYS = SECTIONS.map((s) => s.key);
// '#' 없이 한 줄로 적힌 헤더도 인식 (샘플의 '프로그램팀' 등 별칭 포함)
const EXACT_HEADERS = [
  '프로그램', '프로그램팀', '엔진', '엔진팀', '아트', '아트팀',
  '기획', 'PM', 'PD', 'CCO', '대표님', '경영진', '기타',
];

export function parseDailyInput(inputText: string): DailySections {
  const sections: DailySections = Object.fromEntries(SECTION_KEYS.map((k) => [k, []]));
  let currentSection: string | null = null;

  for (const line of inputText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const headerText = trimmed.replace(/^#+\s*/, '').trim();
    const matched = SECTIONS.find((s) => s.match(headerText));
    const isExact = EXACT_HEADERS.some((h) => h.toLowerCase() === trimmed.toLowerCase());

    if (matched && (trimmed.startsWith('#') || isExact)) {
      currentSection = matched.key;
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
{"프로그램":["- **주제:** 내용"],"엔진":[],"아트":[],"기획":[],"PM":[],"PD":[],"CCO":[],"대표님":[],"기타":[]}

**주의:** 입력된 "경영진"은 "대표님" 키에, "공지/공지사항"은 "기타" 키에 매핑하십시오.

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
