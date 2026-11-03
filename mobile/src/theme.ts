import { StyleSheet } from 'react-native';
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

export function appTheme(dark: boolean) {
  const base = dark ? MD3DarkTheme : MD3LightTheme;
  return { ...base, colors: { ...base.colors, primary: dark ? '#b8c4ff' : '#384bc2', onPrimary: dark ? '#102577' : '#ffffff', primaryContainer: dark ? '#293b91' : '#e1e5ff', onPrimaryContainer: dark ? '#e1e5ff' : '#102577', secondaryContainer: dark ? '#29344f' : '#e1e7f6', tertiary: dark ? '#8ed8b9' : '#16765c', tertiaryContainer: dark ? '#064f3c' : '#b4f0d5', background: dark ? '#10131d' : '#f5f7fb', surface: dark ? '#171b28' : '#ffffff' } };
}
export const tabs = [
  { key: 'camera', title: 'Camera', focusedIcon: 'camera', unfocusedIcon: 'camera-outline' },
  { key: 'snaps', title: 'Snaps', focusedIcon: 'inbox', unfocusedIcon: 'inbox-outline' },
  { key: 'mates', title: 'Mates', focusedIcon: 'account-group', unfocusedIcon: 'account-group-outline' },
  { key: 'study', title: 'Study', focusedIcon: 'book-open-page-variant', unfocusedIcon: 'book-open-page-variant-outline' },
  { key: 'profile', title: 'Profile', focusedIcon: 'account-circle', unfocusedIcon: 'account-circle-outline' },
];
export const styles = StyleSheet.create({
  flex: { flex: 1 }, row: { flexDirection: 'row' }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  page: { padding: 20, paddingBottom: 48, gap: 8, width: '100%', maxWidth: 860, alignSelf: 'center' },
  paragraph: { marginVertical: 12 }, section: { marginTop: 24, marginBottom: 8 }, action: { marginTop: 20, marginBottom: 12, minHeight: 48, justifyContent: 'center' },
  field: { marginVertical: 8, minHeight: 56 }, editor: { minHeight: 240, marginVertical: 16 }, authIntro: { paddingTop: 28, paddingBottom: 28 },
  panel: { padding: 24, borderRadius: 16, marginVertical: 16 }, listItem: { paddingVertical: 20, gap: 12 }, code: { letterSpacing: 2, marginVertical: 16 },
  photo: { width: '100%', aspectRatio: 0.8, resizeMode: 'contain', borderRadius: 16, marginVertical: 16 },
  capturePreview: { maxHeight: 280 },
  permission: { flex: 1, justifyContent: 'center', padding: 28, gap: 12 }, cameraTop: { alignItems: 'center', paddingTop: 16 },
  cameraControls: { position: 'absolute', bottom: 24, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', gap: 16 },
  choice: { minHeight: 56, marginVertical: 4, borderRadius: 12 }, timer: { flexDirection: 'row', padding: 16, alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  drawer: { width: 200, paddingTop: 16 }, calendar: { flexDirection: 'row', gap: 4, paddingVertical: 16 }, week: { gap: 4 }, day: { width: 12, height: 12, borderRadius: 2 },
});
