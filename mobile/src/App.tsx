import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StatusBar, View, useColorScheme, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Appbar, BottomNavigation, Dialog, Drawer, PaperProvider, Portal, ProgressBar, SegmentedButtons, Snackbar, Text, useTheme } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { MobileApi, mobileSession, signOutMobile, validateApiUrl } from './api.mjs';
import { useWorkspace, Session } from './useWorkspace';
import { Button, Field, Page, Screen } from './screens';
import { appTheme, styles as s, tabs } from './theme';

const SESSION_KEY = 'mocktaste.mobile.session';
const allowLocalNetwork = Constants.expoConfig?.extra?.allowLocalNetwork === true;
export default function App() {
  const dark = useColorScheme() === 'dark';
  const theme = useMemo(() => appTheme(dark), [dark]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const expire = useCallback(() => { setSession(null); SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {}); setMessage('Your session ended. Sign in again.'); }, []);
  useEffect(() => {
    let mounted = true;
    SecureStore.getItemAsync(SESSION_KEY).then(raw => {
      if (!raw || !mounted) return;
      const saved = JSON.parse(raw); saved.base = validateApiUrl(saved.base, allowLocalNetwork);
      setSession(mobileSession(saved.base, saved));
    }).catch(error => { SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {}); setMessage(error.message); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);
  const signIn = async (value: Session) => { await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(value)); setSession(value); };
  const signOut = async () => {
    if (!session) return;
    const result = await signOutMobile(new MobileApi(session.base, session.token), async () => { await SecureStore.deleteItemAsync(SESSION_KEY); setSession(null); });
    if (!result.revoked) setMessage('Signed out on this phone. Server session revocation could not be confirmed.');
  };
  return <SafeAreaProvider><PaperProvider theme={theme} settings={{ icon: props => <MaterialCommunityIcons {...props} name={props.name as any} /> }}>
    <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
    {loading ? <View style={[s.center, { backgroundColor: theme.colors.background }]}><ActivityIndicator accessibilityLabel="Opening MockTaste" /></View> : session ? session.user.role === 'teacher' ? <Teacher signOut={signOut} onError={setMessage} /> : <Workspace key={session.token} session={session} onExpired={expire} signOut={signOut} /> : <Auth onSignIn={signIn} />}
    <Snackbar visible={Boolean(message)} onDismiss={() => setMessage('')} duration={6500}>{message}</Snackbar>
  </PaperProvider></SafeAreaProvider>;
}
function Teacher({ signOut, onError }: { signOut: () => Promise<void>; onError: (message: string) => void }) {
  const insets = useSafeAreaInsets(); const theme = useTheme();
  return <View style={[s.flex, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}><Appbar.Header statusBarHeight={0}><Appbar.Content title="MockTaste" /></Appbar.Header><Page><Text variant="headlineSmall">Your teacher account is ready</Text><Text variant="bodyLarge" style={s.paragraph}>Teaching and classroom tools will be added after the teacher workflow is defined.</Text><Button mode="outlined" onPress={() => signOut().catch(error => onError(error.message))}>Sign out</Button></Page></View>;
}
function Auth({ onSignIn }: { onSignIn: (session: Session) => Promise<void> }) {
  const insets = useSafeAreaInsets(); const theme = useTheme();
  const [signup, setSignup] = useState(false); const [base, setBase] = useState(process.env.EXPO_PUBLIC_API_URL || '');
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [password, setPassword] = useState('');
  const [role, setRole] = useState('student'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      if (!email.trim() || !password || (signup && !name.trim())) throw new Error('Fill in your account details.');
      const origin = validateApiUrl(base, allowLocalNetwork); setBusy(true);
      const result = await new MobileApi(origin).request(`/api/mobile/${signup ? 'signup' : 'login'}`, { method: 'POST', publicRequest: true, body: { email: email.trim(), password, name, role, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      try { await onSignIn(mobileSession(origin, result)); }
      catch (failure) { await new MobileApi(origin, result.token).request('/api/mobile/logout', { method: 'POST' }).catch(() => {}); throw failure; }
    } catch (failure: any) { setError(failure.message || 'Could not sign in. Check the workspace address and try again.'); }
    finally { setBusy(false); }
  };
  return <KeyboardAvoidingView style={[s.flex, { backgroundColor: theme.colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Page>
    <View style={s.authIntro}><Text variant="headlineMedium" style={{ color: theme.colors.primary }}>MockTaste</Text><Text variant="displaySmall" style={s.paragraph}>Study it. Snap it. Make it stick.</Text><Text variant="bodyLarge">A quick quiz before a shared study moment.</Text></View>
    <SegmentedButtons value={signup ? 'signup' : 'login'} onValueChange={value => { setSignup(value === 'signup'); setError(''); }} buttons={[{ value: 'login', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} />
    <Field label="Workspace address" value={base} onChangeText={setBase} autoCapitalize="none" keyboardType="url" autoCorrect={false} placeholder="https://your-workspace.example" editable={!busy} />
    <Text variant="bodySmall">Use the address provided for this workspace. Your account and study mates belong to that server.</Text>
    {signup && <><Field label="Your name" value={name} onChangeText={setName} maxLength={80} autoComplete="name" editable={!busy} /><SegmentedButtons style={s.field} value={role} onValueChange={setRole} buttons={[{ value: 'student', label: 'Student' }, { value: 'teacher', label: 'Teacher' }]} />{role === 'teacher' && <Text variant="bodySmall">Teacher accounts can sign in; classroom features are coming later.</Text>}</>}
    <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!busy} />
    <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={signup ? 'new-password' : 'current-password'} maxLength={128} editable={!busy} />
    {signup && <Text variant="bodySmall">At least 10 characters.</Text>}{Boolean(error) && <Text accessibilityRole="alert" style={[s.paragraph, { color: theme.colors.error }]}>{error}</Text>}
    <Button mode="contained" style={s.action} loading={busy} disabled={busy} onPress={submit}>{signup ? 'Create account' : 'Sign in'}</Button>
  </Page></KeyboardAvoidingView>;
}
function Workspace(props: { session: Session; onExpired: () => void; signOut: () => Promise<void> }) {
  const c = useWorkspace(props); const theme = useTheme(); const insets = useSafeAreaInsets(); const { width } = useWindowDimensions(); const wide = width >= 720;
  const title = c.detail ? ({ snap: 'Study snap', job: 'Preparing', test: 'Personal test', material: 'Study material', note: 'New note', 'create-test': 'Create a test' } as Record<string, string>)[c.detail.kind] || 'MockTaste' : c.tab === 'camera' ? 'MockTaste' : tabs.find(item => item.key === c.tab)!.title;
  return <View style={[s.flex, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
    <Appbar.Header statusBarHeight={0}>{(c.detail || c.photo) && <Appbar.BackAction onPress={c.back} />}<Appbar.Content title={title} />{(c.detail || c.photo || c.tab !== 'camera') && <Appbar.Action icon="refresh" accessibilityLabel="Refresh workspace" disabled={c.busy} onPress={c.refreshVisible} />}</Appbar.Header>
    <KeyboardAvoidingView style={[s.flex, wide && s.row]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{wide && <Drawer.Section style={s.drawer}>{tabs.map(item => <Drawer.Item key={item.key} label={item.title} icon={item.focusedIcon} active={c.tab === item.key} onPress={() => c.changeTab(item.key)} />)}</Drawer.Section>}<View style={s.flex}>{!c.data ? <View style={s.center}><ActivityIndicator /><Text style={s.paragraph}>Opening your workspace…</Text><Button onPress={c.refreshVisible}>Retry connection</Button><Button mode="outlined" onPress={() => c.run(c.signOut)}>Sign out</Button></View> : <Screen c={c} />}</View></KeyboardAvoidingView>
    {!wide && <BottomNavigation.Bar navigationState={{ index: tabs.findIndex(item => item.key === c.tab), routes: tabs }} onTabPress={({ route }) => c.changeTab(route.key)} safeAreaInsets={{ bottom: insets.bottom }} />}{wide && <View style={{ height: insets.bottom }} />}
    {c.busy && <ProgressBar indeterminate accessibilityLabel="Working" />}<Snackbar style={{ marginBottom: insets.bottom + (wide ? 0 : 80) }} visible={Boolean(c.message)} onDismiss={() => c.setMessage('')} duration={6500}>{c.message}</Snackbar>
    <Portal><Dialog visible={Boolean(c.confirm)} onDismiss={() => c.setConfirm(null)}><Dialog.Title>{c.confirm?.title}</Dialog.Title><Dialog.Content><Text variant="bodyLarge">{c.confirm?.text}</Text></Dialog.Content><Dialog.Actions><Button onPress={() => c.setConfirm(null)}>Cancel</Button><Button onPress={() => { const action = c.confirm?.action; c.setConfirm(null); action?.(); }}>Continue</Button></Dialog.Actions></Dialog></Portal>
  </View>;
}
