import React, { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SplitView } from '../components/SplitView';
import { HtmlPreview } from '../components/HtmlPreview';
import { ConfirmDialog, DialogButton } from '../components/ConfirmDialog';
import { useLayout } from '../hooks/useLayout';
import { geminiRequest } from '../api/gemini';
import { createConfluencePage, getPageUrl } from '../api/confluence';
import { createNotionPage } from '../api/notion';
import { CONFIG } from '../config';

type AlertState = { visible: boolean; title: string; message: string; buttons: DialogButton[] };
const CLOSED: AlertState = { visible: false, title: '', message: '', buttons: [] };

export function NewDocumentScreen() {
  const { isTablet } = useLayout();
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [content, setContent] = useState('');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [alert, setAlert] = useState<AlertState>(CLOSED);

  const showAlert = (title: string, message: string, buttons?: DialogButton[]) =>
    setAlert({ visible: true, title, message, buttons: buttons ?? [{ text: '확인', onPress: () => setAlert(CLOSED) }] });

  async function handleGenerate() {
    if (!title.trim() || !content.trim()) {
      showAlert('오류', '제목과 내용을 입력해주세요.');
      return;
    }
    setLoading(true);
    setStatus('AI가 문서를 처리하는 중...');
    try {
      const result = await geminiRequest(prompt || '문서를 Confluence 형식으로 정리해주세요.', content);
      setHtml(result);
      setStatus('생성 완료! 미리보기를 확인하세요.');
    } catch (e: any) {
      showAlert('AI 오류', e.message);
      setStatus('');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    if (!html) { showAlert('오류', '먼저 AI 생성을 실행해주세요.'); return; }
    setLoading(true);
    setStatus('Confluence에 업로드 중...');
    try {
      const page = await createConfluencePage(title, html);
      const url = getPageUrl(page.id);
      setStatus(`완료! ${url}`);
      showAlert('업로드 완료', url, [
        { text: '닫기', cancel: true, onPress: () => setAlert(CLOSED) },
        ...(CONFIG.notion.apiKey ? [{
          text: 'Notion에도 저장',
          onPress: () => { setAlert(CLOSED); handleNotionSave(url); },
        }] : []),
      ]);
    } catch (e: any) {
      showAlert('업로드 오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleNotionSave(confluenceUrl: string) {
    if (!CONFIG.notion.apiKey) return;
    setLoading(true);
    setStatus('Notion에 저장 중...');
    try {
      const result = await createNotionPage(title, html, confluenceUrl);
      showAlert('Notion 저장 완료', result.url);
    } catch (e: any) {
      showAlert('Notion 오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  const inputPanel = (
    <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
      <Text style={styles.label}>제목</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="문서 제목" />

      <Text style={styles.label}>AI 프롬프트</Text>
      <TextInput
        style={styles.input} value={prompt} onChangeText={setPrompt}
        placeholder="예: 개발 가이드 형식으로 정리해주세요"
      />

      <Text style={styles.label}>내용</Text>
      <TextInput
        style={[styles.input, styles.multiline]} value={content} onChangeText={setContent}
        placeholder="문서 내용을 입력하세요..." multiline numberOfLines={8}
      />

      {status ? <Text style={styles.status}>{status}</Text> : null}
      {loading && <ActivityIndicator style={{ marginVertical: 8 }} />}

      <TouchableOpacity style={styles.btn} onPress={handleGenerate} disabled={loading}>
        <Text style={styles.btnText}>AI 생성</Text>
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
      <SplitView
        left={inputPanel}
        right={<HtmlPreview html={html} />}
      />
      {!isTablet && (
        <HtmlPreview html={html} asModal visible={previewVisible} onClose={() => setPreviewVisible(false)} />
      )}
      <ConfirmDialog
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        buttons={alert.buttons}
      />
    </>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: '#fff' },
  panelContent: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#172B4D', marginBottom: 4, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 10, fontSize: 14, backgroundColor: '#fafafa' },
  multiline: { height: 140, textAlignVertical: 'top' },
  status: { fontSize: 12, color: '#666', marginTop: 8 },
  btn: { backgroundColor: '#0052CC', borderRadius: 6, padding: 14, alignItems: 'center', marginTop: 12 },
  btnSecondary: { backgroundColor: '#6554C0' },
  btnSuccess: { backgroundColor: '#00875A' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
