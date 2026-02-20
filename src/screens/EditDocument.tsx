import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, FlatList,
} from 'react-native';
import { SplitView } from '../components/SplitView';
import { HtmlPreview } from '../components/HtmlPreview';
import { ConfirmDialog, DialogButton } from '../components/ConfirmDialog';
import { useLayout } from '../hooks/useLayout';
import { geminiRequest, GeminiTurn } from '../api/gemini';
import {
  getConfluencePage, createConfluencePage, updateConfluencePage,
  deleteConfluencePage, extractPageId, getPageUrl,
} from '../api/confluence';

const MAX_FULL_TURNS = 2;

type ChatMessage = { role: 'user' | 'ai'; text: string };
type AlertState = { visible: boolean; title: string; message: string; buttons: DialogButton[] };
const CLOSED: AlertState = { visible: false, title: '', message: '', buttons: [] };

export function EditDocumentScreen() {
  const { isTablet } = useLayout();
  const [pageInput, setPageInput] = useState('');
  const [editInstruction, setEditInstruction] = useState('');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [alert, setAlert] = useState<AlertState>(CLOSED);

  const [originalContent, setOriginalContent] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [originalPageId, setOriginalPageId] = useState('');
  const [scratchPageId, setScratchPageId] = useState('');
  const [scratchVersion, setScratchVersion] = useState(1);
  const [editInstructions, setEditInstructions] = useState<string[]>([]);
  const [recentTurns, setRecentTurns] = useState<{ user: GeminiTurn; model: GeminiTurn }[]>([]);
  const [pageLoaded, setPageLoaded] = useState(false);

  const showAlert = (title: string, message: string, buttons?: DialogButton[]) =>
    setAlert({ visible: true, title, message, buttons: buttons ?? [{ text: '확인', onPress: () => setAlert(CLOSED) }] });

  async function handleLoadPage() {
    const pageId = extractPageId(pageInput);
    if (!pageId) { showAlert('오류', '유효한 Confluence URL 또는 페이지 ID를 입력해주세요.'); return; }
    setLoading(true);
    setStatus('페이지를 불러오는 중...');
    try {
      const page = await getConfluencePage(pageId);
      const content = page.body?.storage?.value ?? '';
      setOriginalContent(content);
      setOriginalTitle(page.title);
      setOriginalPageId(pageId);
      setHtml(content);

      const scratch = await createConfluencePage(
        `[임시] ${page.title} - ${new Date().toLocaleString('ko-KR')}`,
        content
      );
      setScratchPageId(scratch.id);
      setScratchVersion(scratch.version?.number ?? 1);
      setPageLoaded(true);
      setStatus(`로드 완료: "${page.title}"`);
    } catch (e: any) {
      showAlert('오류', e.message);
      setStatus('');
    } finally {
      setLoading(false);
    }
  }

  function buildHistory(): GeminiTurn[] {
    const history: GeminiTurn[] = [
      { role: 'user', parts: [{ text: `다음은 편집할 원본 Confluence 문서입니다:\n${originalContent}` }] },
      { role: 'model', parts: [{ text: '문서를 확인했습니다. 수정 지시를 해주세요.' }] },
    ];
    const summarizedCount = editInstructions.length - recentTurns.length;
    if (summarizedCount > 0) {
      const summary = editInstructions.slice(0, summarizedCount).map((inst, i) => `${i + 1}. ${inst}`).join('\n');
      history.push({ role: 'user', parts: [{ text: `지금까지 적용된 수정 이력:\n${summary}` }] });
      history.push({ role: 'model', parts: [{ text: '이전 수정 이력을 확인했습니다.' }] });
    }
    for (const turn of recentTurns) {
      history.push(turn.user);
      history.push(turn.model);
    }
    return history;
  }

  async function handleEdit() {
    if (!editInstruction.trim()) return;
    setLoading(true);
    setStatus('AI가 수정하는 중...');
    try {
      const history = buildHistory();
      const newHtml = await geminiRequest(editInstruction, html, history);

      const newTurn = {
        user: { role: 'user' as const, parts: [{ text: `현재 문서:\n${html}\n\n수정 지시:\n${editInstruction}` }] },
        model: { role: 'model' as const, parts: [{ text: newHtml }] },
      };
      const updatedTurns = [...recentTurns, newTurn].slice(-MAX_FULL_TURNS);
      setRecentTurns(updatedTurns);
      setEditInstructions([...editInstructions, editInstruction]);
      setHtml(newHtml);

      const updated = await updateConfluencePage(scratchPageId, `[임시] ${originalTitle}`, newHtml, scratchVersion);
      setScratchVersion(updated.version?.number ?? scratchVersion + 1);

      setChatHistory([...chatHistory, { role: 'user', text: editInstruction }, { role: 'ai', text: '수정 완료' }]);
      setEditInstruction('');
      setStatus('수정 완료! 미리보기를 확인하세요.');
    } catch (e: any) {
      showAlert('수정 오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    setLoading(true);
    setStatus('원본 문서를 업데이트하는 중...');
    try {
      const latest = await getConfluencePage(originalPageId);
      await updateConfluencePage(originalPageId, originalTitle, html, latest.version.number);
      await deleteConfluencePage(scratchPageId);
      const url = getPageUrl(originalPageId);
      setStatus(`완료! ${url}`);
      showAlert('업데이트 완료', url);
    } catch (e: any) {
      showAlert('오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  const inputPanel = (
    <View style={styles.panel}>
      {!pageLoaded ? (
        <ScrollView contentContainerStyle={styles.panelContent}>
          <Text style={styles.label}>Confluence 페이지 URL 또는 ID</Text>
          <TextInput
            style={styles.input} value={pageInput} onChangeText={setPageInput}
            placeholder="https://... 또는 숫자 ID"
          />
          {loading && <ActivityIndicator style={{ marginVertical: 8 }} />}
          {status ? <Text style={styles.status}>{status}</Text> : null}
          <TouchableOpacity style={styles.btn} onPress={handleLoadPage} disabled={loading}>
            <Text style={styles.btnText}>페이지 불러오기</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            data={chatHistory}
            keyExtractor={(_, i) => String(i)}
            style={styles.chat}
            renderItem={({ item }) => (
              <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                <Text style={[styles.bubbleText, item.role === 'ai' && styles.bubbleTextAi]}>{item.text}</Text>
              </View>
            )}
          />
          <View style={styles.chatInput}>
            <TextInput
              style={styles.chatTextInput} value={editInstruction} onChangeText={setEditInstruction}
              placeholder="수정 지시사항 입력..." multiline
            />
            <TouchableOpacity style={styles.sendBtn} onPress={handleEdit} disabled={loading}>
              <Text style={styles.sendText}>전송</Text>
            </TouchableOpacity>
          </View>
          {loading && <ActivityIndicator style={{ margin: 8 }} />}
          {status ? <Text style={[styles.status, { paddingHorizontal: 12 }]}>{status}</Text> : null}
          {!isTablet && html ? (
            <TouchableOpacity style={[styles.btn, styles.btnSecondary, { margin: 12 }]} onPress={() => setPreviewVisible(true)}>
              <Text style={styles.btnText}>미리보기 ▶</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.btn, styles.btnSuccess, { margin: 12 }]} onPress={handleApply} disabled={loading}>
            <Text style={styles.btnText}>원본에 반영</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <>
      <SplitView left={inputPanel} right={<HtmlPreview html={html} />} />
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
  status: { fontSize: 12, color: '#666', marginTop: 8 },
  btn: { backgroundColor: '#0052CC', borderRadius: 6, padding: 14, alignItems: 'center', marginTop: 12 },
  btnSecondary: { backgroundColor: '#6554C0' },
  btnSuccess: { backgroundColor: '#00875A' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  chat: { flex: 1, padding: 12 },
  bubble: { maxWidth: '80%', borderRadius: 12, padding: 10, marginVertical: 4 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#0052CC' },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: '#f0f0f0' },
  bubbleText: { fontSize: 14, color: '#fff' },
  bubbleTextAi: { color: '#333' },
  chatInput: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#eee', padding: 8, alignItems: 'flex-end' },
  chatTextInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 8, maxHeight: 100 },
  sendBtn: { backgroundColor: '#0052CC', borderRadius: 8, padding: 10, marginLeft: 8 },
  sendText: { color: '#fff', fontWeight: '600' },
});
