import React, { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { ConfirmDialog, DialogButton } from '../components/ConfirmDialog';
import { geminiRequest, GeminiTurn } from '../api/gemini';
import {
  createConfluencePage, updateConfluencePage,
  deleteConfluencePage, getPageUrl, searchConfluenceByTitle,
} from '../api/confluence';
import { CONFIG } from '../config';

const MAX_FULL_TURNS = 2;

type Phase = 'input' | 'scratch' | 'done';
type AlertState = { visible: boolean; title: string; message: string; buttons: DialogButton[] };
const CLOSED: AlertState = { visible: false, title: '', message: '', buttons: [] };

export function NewDocumentScreen() {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [content, setContent] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [alert, setAlert] = useState<AlertState>(CLOSED);

  const [currentWiki, setCurrentWiki] = useState('');
  const [scratchPageId, setScratchPageId] = useState('');
  const [scratchTitle, setScratchTitle] = useState('');
  const [scratchVersion, setScratchVersion] = useState(1);
  const [editInstruction, setEditInstruction] = useState('');
  const [editInstructions, setEditInstructions] = useState<string[]>([]);
  const [recentTurns, setRecentTurns] = useState<{ user: GeminiTurn; model: GeminiTurn }[]>([]);
  const [finalPageUrl, setFinalPageUrl] = useState('');

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
      const wiki = await geminiRequest(
        prompt || '문서를 Confluence 형식으로 정리해주세요.',
        content,
        [],
        'wiki'
      );
      setCurrentWiki(wiki);

      const st = `[임시] ${title} - ${new Date().toLocaleString('ko-KR')}`;
      setScratchTitle(st);
      setStatus('임시 페이지 생성 중...');
      const scratch = await createConfluencePage(st, wiki, CONFIG.atlassian.parentIdDoc, 'wiki');
      setScratchPageId(scratch.id);
      setScratchVersion(scratch.version?.number ?? 1);
      setPhase('scratch');
      setStatus('임시 페이지가 생성되었습니다. 아래 링크에서 미리보기 하세요.');
    } catch (e: any) {
      showAlert('오류', e.message);
      setStatus('');
    } finally {
      setLoading(false);
    }
  }

  function buildHistory(): GeminiTurn[] {
    const history: GeminiTurn[] = [
      { role: 'user', parts: [{ text: `다음은 편집할 원본 Confluence 문서입니다:\n${currentWiki}` }] },
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

  async function handleAdditionalEdit() {
    if (!editInstruction.trim()) return;
    setLoading(true);
    setStatus('AI가 수정하는 중...');
    try {
      const history = buildHistory();
      const newWiki = await geminiRequest(editInstruction, currentWiki, history, 'wiki');

      const newTurn = {
        user: { role: 'user' as const, parts: [{ text: `현재 문서:\n${currentWiki}\n\n수정 지시:\n${editInstruction}` }] },
        model: { role: 'model' as const, parts: [{ text: newWiki }] },
      };
      setRecentTurns([...recentTurns, newTurn].slice(-MAX_FULL_TURNS));
      setEditInstructions([...editInstructions, editInstruction]);
      setCurrentWiki(newWiki);
      setEditInstruction('');

      const updated = await updateConfluencePage(scratchPageId, scratchTitle, newWiki, scratchVersion, 'wiki');
      setScratchVersion(updated.version?.number ?? scratchVersion + 1);
      setStatus('수정 완료! 임시 페이지에서 미리보기를 확인하세요.');
    } catch (e: any) {
      showAlert('수정 오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setLoading(true);
    setStatus('최종 페이지를 생성하는 중...');
    try {
      let finalTitle = title;
      const existing = await searchConfluenceByTitle(title);
      if (existing.length > 0) {
        let n = 1;
        while (true) {
          const candidate = `${title} (${n})`;
          const found = await searchConfluenceByTitle(candidate);
          if (found.length === 0) { finalTitle = candidate; break; }
          n++;
        }
      }
      const page = await createConfluencePage(finalTitle, currentWiki, CONFIG.atlassian.parentIdDoc, 'wiki');
      const url = getPageUrl(page.id);
      try { await deleteConfluencePage(scratchPageId); } catch {}
      setFinalPageUrl(url);
      setPhase('done');
      setStatus(`완료! ${url}`);
    } catch (e: any) {
      showAlert('생성 오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    if (scratchPageId) {
      try { await deleteConfluencePage(scratchPageId); } catch {}
    }
    setTitle('');
    setPrompt('');
    setContent('');
    setCurrentWiki('');
    setScratchPageId('');
    setScratchTitle('');
    setScratchVersion(1);
    setEditInstruction('');
    setEditInstructions([]);
    setRecentTurns([]);
    setFinalPageUrl('');
    setPhase('input');
    setStatus('');
  }

  return (
    <>
      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        {phase === 'input' && (
          <>
            <Text style={styles.label}>제목</Text>
            <TextInput
              style={styles.input} value={title} onChangeText={setTitle}
              placeholder="문서 제목"
            />

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
          </>
        )}

        {phase === 'scratch' && (
          <>
            <Text style={styles.sectionTitle}>임시 페이지 미리보기</Text>
            <a href={getPageUrl(scratchPageId)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <Text style={styles.link}>Confluence에서 미리보기 →</Text>
            </a>

            <Text style={[styles.label, { marginTop: 20 }]}>추가 수정 (선택)</Text>
            <TextInput
              style={[styles.input, styles.editArea]} value={editInstruction} onChangeText={setEditInstruction}
              placeholder="수정 지시사항 입력..." multiline numberOfLines={4}
            />

            {status ? <Text style={styles.status}>{status}</Text> : null}
            {loading && <ActivityIndicator style={{ marginVertical: 8 }} />}

            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={handleAdditionalEdit}
              disabled={loading || !editInstruction.trim()}
            >
              <Text style={styles.btnText}>추가 수정</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.btnSuccess]} onPress={handleCreate} disabled={loading}>
              <Text style={styles.btnText}>최종 페이지 생성</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleReset} disabled={loading}>
              <Text style={styles.btnText}>다시 시작</Text>
            </TouchableOpacity>
          </>
        )}

        {phase === 'done' && (
          <>
            <Text style={styles.sectionTitle}>페이지 생성 완료!</Text>
            <a href={finalPageUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <Text style={styles.link}>{finalPageUrl}</Text>
            </a>

            <TouchableOpacity style={[styles.btn, { marginTop: 24 }]} onPress={handleReset}>
              <Text style={styles.btnText}>새 문서 작성</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
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
  editArea: { height: 100, textAlignVertical: 'top' },
  status: { fontSize: 12, color: '#666', marginTop: 8 },
  btn: { backgroundColor: '#0052CC', borderRadius: 6, padding: 14, alignItems: 'center', marginTop: 12 },
  btnSecondary: { backgroundColor: '#6554C0' },
  btnSuccess: { backgroundColor: '#00875A' },
  btnDanger: { backgroundColor: '#DE350B' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#172B4D', marginBottom: 8 },
  link: { color: '#0052CC', fontSize: 14, textDecorationLine: 'underline', marginVertical: 4 },
});
