import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as DocumentPicker from 'expo-document-picker';
import { MobileApi } from './api.mjs';
import { submitPractice } from './practice.mjs';

export type Session = { base: string; token: string; user: { id: string; name: string; email: string; role: string; timeZone: string } };
type Detail = { kind: string; value?: any } | null;
export const removeCachedFile = (uri?: string) => { if (!uri || !uri.startsWith(`${Paths.cache.uri.replace(/\/$/, '')}/`)) return; try { const file = new File(uri); if (file.exists) file.delete(); } catch {} };

export function useWorkspace({ session, onExpired, signOut }: { session: Session; onExpired: () => void; signOut: () => Promise<void> }) {
  const api = useMemo(() => new MobileApi(session.base, session.token, onExpired), [session.base, session.token, onExpired]);
  const [data, setData] = useState<any>(null); const [tab, setTab] = useState('camera'); const [detail, setDetail] = useState<Detail>(null);
  const detailRef = useRef(detail); detailRef.current = detail;
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const busyRef = useRef(false); const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null); const photoRef = useRef<string | undefined>(undefined); const [caption, setCaption] = useState('');
  const [job, setJob] = useState<any>(null); const [miniIndex, setMiniIndex] = useState(0); const [miniAnswers, setMiniAnswers] = useState<Record<string, number>>({}); const [selectedMates, setSelectedMates] = useState<string[]>([]);
  const [mateCode, setMateCode] = useState(''); const [studyView, setStudyView] = useState('notes');
  const [noteName, setNoteName] = useState(''); const [subject, setSubject] = useState(''); const [noteText, setNoteText] = useState('');
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]); const [testTitle, setTestTitle] = useState(''); const [testCount, setTestCount] = useState('10'); const [testMinutes, setTestMinutes] = useState('15'); const [difficulty, setDifficulty] = useState('medium');
  const [testAnswers, setTestAnswers] = useState<Record<string, number>>({}); const answerRef = useRef<Record<string, number>>({}); const queue = useRef<Promise<any>>(Promise.resolve()); const submitRef = useRef(false); const [submittingId, setSubmittingId] = useState<string | null>(null); const [clock, setClock] = useState(Date.now());
  const [confirm, setConfirm] = useState<{ title: string; text: string; action: () => void } | null>(null);
  const refresh = useCallback(async () => { const result = await api.student('/state'); setData(result); return result; }, [api]);
  const run = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await task(); } catch (error: any) { setMessage(error.message || 'Something went wrong. Please try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const acceptPhoto = (value: { uri: string; base64: string }) => { removeCachedFile(photoRef.current); photoRef.current = value.uri; setPhoto(value); };
  const discardPhoto = () => { removeCachedFile(photoRef.current); photoRef.current = undefined; setPhoto(null); setCaption(''); };
  const refreshVisible = () => { setRefreshing(true); refresh().catch(error => setMessage(error.message)).finally(() => setRefreshing(false)); };
  useEffect(() => {
    let mounted = true;
    api.request('/api/mobile/session').then(() => refresh()).then(async () => {
      const saved = await SecureStore.getItemAsync(`mocktaste.job.${session.user.id}`);
      if (saved && mounted) { setJob(JSON.parse(saved)); setDetail({ kind: 'job' }); }
    }).catch(error => { if (mounted) setMessage(error.message); });
    const listener = AppState.addEventListener('change', value => { setActive(value === 'active'); if (value === 'active') refresh().catch(error => setMessage(error.message)); });
    return () => { mounted = false; listener.remove(); removeCachedFile(photoRef.current); };
  }, [api, refresh, session.user.id]);
  const startJob = async (jobId: string) => {
    const value = { id: jobId, progress: 'Starting…', photoUri: photoRef.current };
    await SecureStore.setItemAsync(`mocktaste.job.${session.user.id}`, JSON.stringify(value)); setJob(value); setDetail({ kind: 'job' });
  };
  useEffect(() => {
    if (!job?.id) return;
    let canceled = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api.student(`/jobs/${job.id}`);
        if (canceled) return;
        if (result.status === 'running') { setJob((current: any) => current ? { ...current, progress: result.progress } : current); timer = setTimeout(poll, 1800); return; }
        if (result.status === 'error') {
          await SecureStore.deleteItemAsync(`mocktaste.job.${session.user.id}`);
          if (!canceled) { setJob(null); setDetail(current => current?.kind === 'job' ? null : current); setMessage(result.error); } return;
        }
        const updated = await refresh();
        const next: Detail = result.result.snapId ? { kind: 'snap', value: await api.student(`/snaps/${result.result.snapId}`) } : result.result.materialId ? { kind: 'material', value: updated.materials.find((item: any) => item.id === result.result.materialId) } : null;
        await SecureStore.deleteItemAsync(`mocktaste.job.${session.user.id}`);
        if (canceled) return;
        if (result.result.snapId) {
          if (photoRef.current === job.photoUri) discardPhoto();
          if (detailRef.current?.kind === 'job') { setMiniIndex(0); setMiniAnswers({}); setSelectedMates([]); }
        }
        setJob(null); setDetail(current => current?.kind === 'job' ? next : current);
        setMessage(result.result.snapId ? 'Your three-question mini quiz is ready in Snaps.' : result.result.materialId ? 'Study text is ready to review.' : 'Your personal test is ready in Study.');
      } catch (error: any) {
        if (canceled) return;
        setMessage(error.message);
        if (error.status === 404) { await SecureStore.deleteItemAsync(`mocktaste.job.${session.user.id}`); if (!canceled) { setJob(null); setDetail(current => current?.kind === 'job' ? null : current); } }
        else timer = setTimeout(poll, 6000);
      }
    };
    poll(); return () => { canceled = true; clearTimeout(timer); };
  }, [job?.id, api, refresh, session.user.id]);
  const back = () => {
    if (detail?.kind === 'test' && !detail.value.test.attempt) { setConfirm({ title: 'Leave this test?', text: 'Your saved answers stay, and the timer keeps running.', action: () => setDetail(null) }); return true; }
    if (detail?.kind === 'snap' && !detail.value.attempt && detail.value.own && miniIndex > 0) { setMiniIndex(value => value - 1); return true; }
    if (detail) { setDetail(null); return true; }
    if (photo) { discardPhoto(); return true; }
    if (tab !== 'camera') { setTab('camera'); return true; }
    return false;
  };
  useEffect(() => { const listener = BackHandler.addEventListener('hardwareBackPress', back); return () => listener.remove(); });
  const changeTab = (next: string) => {
    const action = () => { setDetail(null); setTab(next); if (next !== 'camera') refresh().catch(error => setMessage(error.message)); };
    if (detail?.kind === 'test' && !detail.value.test.attempt) setConfirm({ title: 'Leave this test?', text: 'Your timer will keep running.', action }); else action();
  };
  const openSnap = (id: string, received = false) => run(async () => {
    const value = await api.student(`/snaps/${id}${received ? '/open' : ''}`, received ? { method: 'POST' } : undefined);
    await refresh(); setMiniIndex(0); setMiniAnswers({}); setSelectedMates([]); setDetail({ kind: 'snap', value });
  });
  const openTest = (id: string) => run(async () => {
    const value = await api.student(`/tests/${id}/start`, { method: 'POST' });
    value.clockOffset = value.serverNow - Date.now();
    answerRef.current = value.answers; setTestAnswers(value.answers); setDetail({ kind: 'test', value }); setClock(Date.now() + value.clockOffset);
  });
  const saveAnswer = (id: string, choice: number) => {
    const answers = { ...answerRef.current, [id]: choice }; answerRef.current = answers; setTestAnswers(answers);
    const testId = detail!.value.test.id;
    queue.current = queue.current.then(() => api.student(`/tests/${testId}/answers`, { method: 'POST', body: { answers } })).catch(error => { setMessage(`Answer not saved: ${error.message}`); });
  };
  const submitTest = async () => {
    if (submitRef.current || detail?.kind !== 'test' || detail.value.test.attempt) return;
    submitRef.current = true; setSubmittingId(detail.value.test.id);
    try {
      const current = detail.value;
      const result = await submitPractice(api, current, answerRef.current, queue.current);
      setDetail(value => value?.kind === 'test' && value.value.test.id === result.test.id ? { kind: 'test', value: result } : value); await refresh();
    } catch (error: any) { setMessage(`${error.message} Your saved answers are kept. Try submitting again.`); }
    finally { submitRef.current = false; setSubmittingId(null); }
  };
  useEffect(() => {
    if (detail?.kind !== 'test' || detail.value.test.attempt) return;
    const timer = setInterval(() => { const now = Date.now() + detail.value.clockOffset; setClock(now); if (now >= detail.value.deadline) submitTest(); }, 1000);
    return () => clearInterval(timer);
  }, [detail?.kind, detail?.value?.test?.id, detail?.value?.test?.attempt]);
  const uploadMaterial = () => run(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset.size || asset.size > 30 * 1024 * 1024) throw new Error('Choose a document of up to 30 MB.');
    try {
      const base64 = await new File(asset.uri).base64();
      const material = await api.student('/materials', { method: 'POST', body: { name: asset.name, subject: 'General', files: [{ name: asset.name, base64 }] } });
      await refresh(); setDetail({ kind: 'material', value: material });
    } finally { removeCachedFile(asset.uri); }
  });
  return { session, api, signOut, data, tab, detail, setDetail, message, setMessage, busy, refreshing, active, photo, acceptPhoto, discardPhoto, caption, setCaption, job, startJob, miniIndex, setMiniIndex, miniAnswers, setMiniAnswers, selectedMates, setSelectedMates, mateCode, setMateCode, studyView, setStudyView, noteName, setNoteName, subject, setSubject, noteText, setNoteText, selectedMaterials, setSelectedMaterials, testTitle, setTestTitle, testCount, setTestCount, testMinutes, setTestMinutes, difficulty, setDifficulty, testAnswers, clock, submitting: submittingId !== null && submittingId === detail?.value?.test?.id, confirm, setConfirm, refresh, refreshVisible, run, back, changeTab, openSnap, openTest, saveAnswer, submitTest, uploadMaterial };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
