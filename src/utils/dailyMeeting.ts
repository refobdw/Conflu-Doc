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

function convertToNestedHTML(lines: string[]): string {
  if (!lines || lines.length === 0) return '';

  let html = '<ul>';
  let currentLevel = 0;
  let openLevels = 1; // 현재 열린 <ul> 개수 추적
  let firstItem = true;

  for (const line of lines) {
    const match = line.match(/^(\s*)([-*•]?)\s*(.*)/);
    if (!match) continue;

    const indent = match[1].length;
    const level = Math.floor(indent / 2);
    let content = match[3].trim();

    if (!content) continue;

    content = content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    if (!content.includes('<b>')) {
      const catMatch = content.match(/^([^:-]+)([:\-]+)\s*(.*)/);
      if (catMatch && catMatch[1].length < 25 && catMatch[3].length > 0) {
        content = `<b>${catMatch[1]}${catMatch[2]}</b> ${catMatch[3]}`;
      }
    }

    if (level > currentLevel) {
      for (let i = 0; i < level - currentLevel; i++) {
        html += '<ul>';
        openLevels++;
      }
    } else if (level < currentLevel) {
      html += '</li>';
      for (let i = 0; i < currentLevel - level; i++) {
        html += '</ul></li>';
        openLevels--;
      }
    } else if (!firstItem) {
      html += '</li>';
    }

    html += `<li>${content}`;
    currentLevel = level;
    firstItem = false;
  }

  html += '</li>';
  for (let i = 0; i < openLevels; i++) {
    html += '</ul>';
    if (i < openLevels - 1) html += '</li>';
  }

  return html.replace(/<li><\/li>/g, '').replace(/<ul><\/ul>/g, '');
}

export function generateDailyHTML(sections: DailySections): string {
  const rows = SECTION_KEYS.map((key) => {
    const items = sections[key] ?? [];
    return `<tr><td><b>${key}</b></td><td>${convertToNestedHTML(items)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>팀</th><th>Doing</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export async function optimizeWithAI(sections: DailySections): Promise<DailySections> {
  const prompt = `당신은 유능한 PM입니다. 입력된 회의록 내용을 **[작성 규칙]**에 따라 정리하여 **JSON 형식**으로 응답하십시오.

### [작성 규칙]
1. 철저한 **개조식** 문장을 사용합니다.
2. 문장의 끝은 반드시 **'~ 진행 중', '~ 함', '~ 음', '~ 예정', '~ 것'** 등 명사형이나 진행형으로 끝맺으십시오.
3. **서식:** 각 항목은 반드시 \`- **주제:** 내용\` 형식이어야 합니다.
4. **주제(라벨) 작성 — 품질의 핵심:**
   - 주제는 작업의 구체적 "대상"(고유명사·기능명·산출물명)으로 작성합니다. "모델링", "최적화", "관리", "문서화", "UI", "시스템" 같은 일반 범주어/활동명만 단독으로 쓰는 것은 금지합니다.
   - ❌ "**모델링:**" 스펙터 모델링 완료 → ✅ "**스펙터 제작:**" 스펙터 모델링 완료
   - ❌ "**최적화:**" 나나이트 최적화 진행 중 → ✅ "**나나이트 최적화:**" 나나이트 최적화 진행 중
   - ❌ "**프로젝트 관리:**" 멸살법 킥오프 팔로우업 → ✅ "**킥오프 어레인지:**" 멸살법 킥오프 팔로우업
   - 좋은 예: input = "인물정보 UI/UX 개발 진행 중" → "- **인물정보:** 인물정보 UI/UX 개발 진행 중"
   - 한 팀 안의 항목들은 주제가 서로 뚜렷이 구별되어야 합니다. 비슷한 라벨(예: "모델링"/"모델링/리깅", "프로젝트 관리"/"데이터 관리")을 반복하지 말고 각 항목의 고유 대상으로 구분하십시오.
5. **내용 다듬기:**
   - 주제에 넣은 단어를 내용에서 의미 없이 반복하지 마십시오. 예: "...비동기 로딩 방식으로 로딩 방식 수정" → "...비동기 로딩 방식으로 수정".
   - 같은 대상·맥락의 항목은 하나로 통합하십시오. 예: "메타 기획"과 "세계관"이 동일 작업이면 한 항목으로 합침.
6. 게임 개발 전문 용어는 그대로 사용하십시오.
7. **다단계(하위) 불릿 보존:** 입력 항목에 하위 불릿(들여쓰기된 하위 항목)이 있다면, 결과에서도 반드시 별도의 하위 항목으로 유지하십시오. 상위 항목 하나로 합치거나 하위 내용을 요약해 없애지 마십시오.
   - 하위 항목은 배열에서 상위 항목 바로 다음 요소(들)로 넣으십시오.
   - 들여쓰기는 **2칸 = 1단계**로 표기하십시오 (예: 1단계 하위 = 앞에 공백 2칸, 2단계 하위 = 공백 4칸).
   - 하위 항목에는 \`**주제:**\` 라벨을 억지로 붙이지 않아도 됩니다. \`  - 내용\` 형식으로 충분합니다.
   - 예: 입력이 "- 인물정보 UI 개발 진행 중" 다음 줄에 들여쓰기된 "- 로그인 화면 완료", "- 프로필 화면 작업 중"이 있으면, 출력 배열은 \`["- **인물정보:** UI 개발 진행 중", "  - 로그인 화면 완료", "  - 프로필 화면 작업 중"]\`처럼 하위 항목의 들여쓰기를 유지하십시오.

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
