import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SplitView } from '../components/SplitView';
import { HtmlPreview } from '../components/HtmlPreview';
import { useLayout } from '../hooks/useLayout';
import { parseDailyInput, generateDailyHTML, optimizeWithAI, getDailyTitle } from '../utils/dailyMeeting';
import { createConfluencePage, searchConfluenceByTitle, updateConfluencePage, getPageUrl } from '../api/confluence';
import { createNotionPage } from '../api/notion';
import { CONFIG } from '../config';

export function DailyMeetingScreen() {
  const { isTablet } = useLayout();
  const [title, setTitle] = useState(getDailyTitle());
  const [content, setContent] = useState('');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);

  async function handleGenerate() {
    if (!content.trim()) { Alert.alert('오류', '회의록 내용을 입력해주세요.'); return; }
    setLoading(true);
    setStatus('파싱 및 AI 최적화 중...');
    try {
      let sections = parseDailyInput(content);
      sections = await optimizeWithAI(sections);
      const result = generateDailyHTML(sections);
      setHtml(result);
      setStatus('생성 완료! 미리보기를 확인하세요.');
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (!html) { Alert.alert('오류', '먼저 회의록을 생성해주세요.'); return; }
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
        const page = await createConfluencePage(title, html);
        pageId = page.id;
      }
      const url = getPageUrl(pageId);
      setStatus(`완료! ${url}`);
      Alert.alert('업로드 완료', url, [
        { text: '닫기' },
        ...(CONFIG.notion.apiKey
          ? [{ text: 'Notion에도 저장', onPress: () => handleNotionSave(url) }]
          : []),
      ]);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleNotionSave(confluenceUrl: string) {
    setLoading(true);
    try {
      const result = await createNotionPage(title, html, confluenceUrl);
      Alert.alert('Notion 저장 완료', result.url);
    } catch (e: any) {
      Alert.alert('Notion 오류', e.message);
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
        placeholder={'### 프로그램\n- 작업 내용\n\n### 엔진\n- 작업 내용'} multiline numberOfLines={12}
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
