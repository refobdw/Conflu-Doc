import { Platform } from 'react-native';
import { CONFIG } from '../config';

const IS_WEB = Platform.OS === 'web';

function notionApiUrl(path: string): string {
  if (IS_WEB) {
    return `/api/notion-proxy?_path=${encodeURIComponent(path)}`;
  }
  return `https://api.notion.com/v1/${path}`;
}

function notionApiHeaders(): Record<string, string> {
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  };
  if (!IS_WEB) {
    base['Authorization'] = `Bearer ${CONFIG.notion.apiKey}`;
  }
  return base;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function createNotionPage(
  title: string,
  htmlContent: string,
  confluenceUrl: string
): Promise<{ url: string }> {
  if (!IS_WEB && (!CONFIG.notion.apiKey || !CONFIG.notion.databaseId)) {
    throw new Error('Notion API 키 또는 데이터베이스 ID가 설정되지 않았습니다.');
  }

  const text = htmlToText(htmlContent);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 2000) chunks.push(text.slice(i, i + 2000));

  const children = chunks.slice(0, 100).map((chunk) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] },
  }));

  const payload = {
    parent: { database_id: CONFIG.notion.databaseId },
    properties: {
      '이름': { title: [{ text: { content: title } }] },
      '상태': { status: { name: '작성완료' } },
      ...(confluenceUrl ? { URL: { url: confluenceUrl } } : {}),
      '자원': { relation: [{ id: '2b9041ed-b161-80d3-8836-e726c5d7049b' }] },
    },
    children,
  };

  const res = await fetch(notionApiUrl('pages'), {
    method: 'POST',
    headers: notionApiHeaders(),
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`Notion 페이지 생성 실패: ${res.status} - ${JSON.stringify(json)}`);
  return json;
}
