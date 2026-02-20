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

export async function createConfluencePage(title: string, htmlBody: string): Promise<ConfluencePage> {
  const payload = {
    type: 'page',
    title,
    space: { key: CONFIG.atlassian.spaceKey },
    ancestors: [{ id: CONFIG.atlassian.parentId }],
    body: { storage: { value: htmlBody, representation: 'storage' } },
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
  pageId: string, title: string, htmlBody: string, version: number
): Promise<ConfluencePage> {
  const payload = {
    type: 'page',
    title,
    body: { storage: { value: htmlBody, representation: 'storage' } },
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
