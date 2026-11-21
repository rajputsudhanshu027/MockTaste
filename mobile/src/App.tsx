import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StatusBar, View, useColorScheme, useWindowDimensions } from 'react-native';
import { ActivityIndicator, Appbar, BottomNavigation, Dialog, Drawer, PaperProvider, Portal, ProgressBar, SegmentedButtons, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
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
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [signup, setSignup] = useState(false);
  const [base, setBase] = useState(process.env.EXPO_PUBLIC_API_URL || '');
  const [editingAddress, setEditingAddress] = useState(!base);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('student');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const action = signup ? 'Create account' : 'Sign in';
  const submit = async () => {
    if (submitting.current) return;
    setError('');
    try {
      let origin;
      try { origin = validateApiUrl(base, allowLocalNetwork); }
      catch (failure) { setEditingAddress(true); throw failure; }
      if (signup && !name.trim()) throw new Error('Enter your name.');
      if (!email.trim() || !email.includes('@')) throw new Error('Enter a valid email address.');
      if (!password) throw new Error('Enter your password.');
      if (signup && password.length < 10) throw new Error('Use at least 10 characters for your password.');
      submitting.current = true;
      setBusy(true);
      const result = await new MobileApi(origin).request(`/api/mobile/${signup ? 'signup' : 'login'}`, {
        method: 'POST', publicRequest: true,
        body: { email: email.trim(), password, name, role, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      try { await onSignIn(mobileSession(origin, result)); }
      catch (failure) { await new MobileApi(origin, result.token).request('/api/mobile/logout', { method: 'POST' }).catch(() => {}); throw failure; }
    } catch (failure: any) { setError(failure.message || 'Could not sign in. Check the workspace address and try again.'); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <KeyboardAvoidingView
    style={[s.flex, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
  >
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[
      s.authScroll, { paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right },
    ]}>
      <View style={s.authPage}>
        <View style={s.authBrand}>
          <View style={[s.authMark, { backgroundColor: colors.tertiaryContainer }]}>
            <MaterialCommunityIcons name="book-open-page-variant-outline" size={22} color={colors.onTertiaryContainer} accessible={false} />
          </View>
          <Text variant="titleMedium">MockTaste</Text>
        </View>
        <View style={[s.authCard, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
          <SegmentedButtons value={signup ? 'signup' : 'login'} onValueChange={value => {
            const next = value === 'signup';
            if (submitting.current || next === signup) return;
            setSignup(next);
            setPassword('');
            setShowPassword(false);
            setError('');
          }} buttons={[
            { value: 'login', label: 'Sign in', disabled: busy, style: s.authTarget },
            { value: 'signup', label: 'Create account', disabled: busy, style: s.authTarget },
          ]} />
          <View style={s.authHeading}>
            <Text accessibilityRole="header" variant="headlineMedium">{signup ? 'Create your account' : 'Welcome back'}</Text>
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
              {signup ? 'Set up your own study workspace.' : 'Sign in to pick up your practice.'}
            </Text>
          </View>
          {editingAddress ? <View style={s.authGroup}>
            <Field label="Workspace address" value={base} onChangeText={setBase} style={s.authField} autoCapitalize="none" keyboardType="url" autoCorrect={false} placeholder="https://your-workspace.example" editable={!busy} />
            <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Use the address where your account is hosted.</Text>
          </View> : <Button style={s.authAddressButton} disabled={busy} onPress={() => setEditingAddress(true)}>Change workspace address</Button>}
          {signup && <Field label="Your name" value={name} onChangeText={setName} style={s.authField} maxLength={80} autoComplete="name" editable={!busy} />}
          <Field label="Email address" value={email} onChangeText={setEmail} style={s.authField} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" maxLength={254} editable={!busy} />
          <View style={s.authGroup}>
            <Field key={signup ? 'new-password' : 'current-password'} label="Password" value={password} onChangeText={setPassword} style={s.authField} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete={signup ? 'new-password' : 'current-password'} maxLength={128} editable={!busy} returnKeyType="go" onSubmitEditing={submit}
              right={<TextInput.Icon icon={showPassword ? 'eye-off-outline' : 'eye-outline'} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword(value => !value)} forceTextInputFocus={false} />}
            />
            {signup && <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Use at least 10 characters.</Text>}
          </View>
          {signup && <View style={s.authGroup}>
            <Text variant="labelLarge">Account type</Text>
            <SegmentedButtons value={role} onValueChange={setRole} buttons={[
              { value: 'student', label: 'Student', disabled: busy, style: s.authTarget },
              { value: 'teacher', label: 'Teacher', disabled: busy, style: s.authTarget },
            ]} />
            {role === 'teacher' && <Text variant="bodySmall">Classroom features are coming later.</Text>}
          </View>}
          {Boolean(error) && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" variant="bodyMedium"
            style={[s.authError, { color: colors.onErrorContainer, backgroundColor: colors.errorContainer }]}>{error}</Text>}
          <Button mode="contained" style={s.authSubmit} buttonColor={colors.tertiary} textColor={colors.onTertiary} loading={busy} disabled={busy} accessibilityState={{ busy }} onPress={submit}>
            {busy ? (signup ? 'Creating account…' : 'Signing in…') : action}
          </Button>
        </View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
function Workspace(props: { session: Session; onExpired: () => void; signOut: () => Promise<void> }) {
  const c = useWorkspace(props); const theme = useTheme(); const insets = useSafeAreaInsets(); const { width } = useWindowDimensions(); const wide = width >= 720;
  const title = c.detail ? ({ snap: 'Study snap', job: 'Preparing', test: 'Personal test', material: 'Study material', note: 'New note', 'create-test': 'Create a test' } as Record<string, string>)[c.detail.kind] || 'MockTaste' : c.tab === 'camera' ? 'MockTaste' : tabs.find(item => item.key === c.tab)!.title;
  return <View style={[s.flex, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
    <Appbar.Header statusBarHeight={0}>{(c.detail || c.photo) && <Appbar.BackAction onPress={c.back} />}<Appbar.Content title={title} />{(c.detail || c.photo || c.tab !== 'camera') && <Appbar.Action icon="refresh" accessibilityLabel="Refresh workspace" disabled={c.busy || c.refreshing} onPress={c.refreshVisible} />}</Appbar.Header>
    <KeyboardAvoidingView style={[s.flex, wide && s.row]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {wide && <Drawer.Section style={s.drawer}>{tabs.map(item => <Drawer.Item key={item.key} label={item.title} icon={item.focusedIcon} active={c.tab === item.key} onPress={() => c.changeTab(item.key)} />)}</Drawer.Section>}
      <View style={s.flex}>
        {c.data ? <Screen c={c} /> : <View style={s.center}>
          {c.refreshing ? <ActivityIndicator accessibilityLabel="Opening your workspace" /> : null}
          <Text style={s.paragraph}>{c.refreshing ? 'Opening your workspace…' : 'Couldn’t open your workspace.'}</Text>
          {!c.refreshing && <Button onPress={c.refreshVisible}>Retry connection</Button>}
          <Button mode="outlined" disabled={c.busy} onPress={() => c.run(c.signOut)}>Sign out</Button>
        </View>}
        {c.busy && <ProgressBar style={s.workspaceProgress} indeterminate accessibilityLabel="Working" />}
      </View>
    </KeyboardAvoidingView>
    {!wide && <BottomNavigation.Bar navigationState={{ index: tabs.findIndex(item => item.key === c.tab), routes: tabs }} onTabPress={({ route }) => c.changeTab(route.key)} safeAreaInsets={{ bottom: insets.bottom }} />}{wide && <View style={{ height: insets.bottom }} />}
    <Snackbar style={{ marginBottom: insets.bottom + (wide ? 0 : 80) }} visible={Boolean(c.message)} onDismiss={() => c.setMessage('')} duration={6500}>{c.message}</Snackbar>
    <Portal><Dialog visible={Boolean(c.confirm)} onDismiss={() => c.setConfirm(null)}><Dialog.Title>{c.confirm?.title}</Dialog.Title><Dialog.Content><Text variant="bodyLarge">{c.confirm?.text}</Text></Dialog.Content><Dialog.Actions><Button onPress={() => c.setConfirm(null)}>Cancel</Button><Button onPress={() => { const action = c.confirm?.action; c.setConfirm(null); action?.(); }}>Continue</Button></Dialog.Actions></Dialog></Portal>
  </View>;
}
