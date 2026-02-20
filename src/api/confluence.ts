import { CONFIG, getAuth } from '../config';

const base = () => `https://${CONFIG.atlassian.baseUrl}`;

export type ConfluencePage = {
  id: string;
  title: string;
  version: { number: number };
  body?: { storage?: { value: string } };
};

export async function getConfluencePage(pageId: string): Promise<ConfluencePage> {
  const res = await fetch(
    `${base()}/wiki/rest/api/content/${pageId}?expand=body.storage,version`,
    { headers: { Authorization: getAuth(), Accept: 'application/json' } }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`페이지 조회 실패 (${res.status}): ${json.message ?? ''}`);
  return json;
}

export async function createConfluencePage(title: string, htmlBody: string): Promise<ConfluencePage> {
  const payload = {
    type: 'page',
    title,
    space: { key: CONFIG.atlassian.spaceKey },
    ancestors: [{ id: CONFIG.atlassian.parentId }],
    body: { storage: { value: htmlBody, representation: 'storage' } },
  };
  const res = await fetch(`${base()}/wiki/rest/api/content`, {
    method: 'POST',
    headers: { Authorization: getAuth(), Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`페이지 생성 실패: ${res.status} - ${JSON.stringify(json)}`);
  return json;
}

export async function updateConfluencePage(
  pageId: string, title: string, htmlBody: string, version: number
): Promise<ConfluencePage> {
  const payload = {
    type: 'page',
    title,
    body: { storage: { value: htmlBody, representation: 'storage' } },
    version: { number: version + 1 },
  };
  const res = await fetch(`${base()}/wiki/rest/api/content/${pageId}`, {
    method: 'PUT',
    headers: { Authorization: getAuth(), Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`페이지 업데이트 실패: ${res.status}`);
  return json;
}

export async function deleteConfluencePage(pageId: string): Promise<void> {
  const res = await fetch(`${base()}/wiki/rest/api/content/${pageId}`, {
    method: 'DELETE',
    headers: { Authorization: getAuth() },
  });
  if (!res.ok) throw new Error(`페이지 삭제 실패: ${res.status}`);
}

export async function searchConfluenceByTitle(title: string): Promise<ConfluencePage[]> {
  const encoded = encodeURIComponent(title);
  const res = await fetch(
    `${base()}/wiki/rest/api/content?title=${encoded}&spaceKey=${CONFIG.atlassian.spaceKey}&expand=version`,
    { headers: { Authorization: getAuth(), Accept: 'application/json' } }
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
