import { StyleSheet } from 'react-native';
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

export function appTheme(dark: boolean) {
  const base = dark ? MD3DarkTheme : MD3LightTheme;
  const colors = dark ? {
    primary: '#f5f5f5', onPrimary: '#141414', primaryContainer: '#3a3a3a', onPrimaryContainer: '#f5f5f5',
    secondary: '#c4c4c4', onSecondary: '#141414', secondaryContainer: '#3a3a3a', onSecondaryContainer: '#f5f5f5',
    tertiary: '#75d36a', onTertiary: '#141414', tertiaryContainer: '#1e3d25', onTertiaryContainer: '#b2e8ab',
    error: '#ff9a88', onError: '#141414', errorContainer: '#49251e', onErrorContainer: '#ff9a88',
    background: '#202020', onBackground: '#f5f5f5', surface: '#2b2b2b', onSurface: '#f5f5f5',
    surfaceVariant: '#3a3a3a', onSurfaceVariant: '#c4c4c4', outline: '#777777', outlineVariant: '#505050',
    shadow: '#000000', scrim: '#00000080', inverseSurface: '#f5f5f5', inverseOnSurface: '#141414', inversePrimary: '#141414',
    elevation: { level0: 'transparent', level1: '#2f2f2f', level2: '#323232', level3: '#353535', level4: '#383838', level5: '#3c3c3c' },
  } : {
    primary: '#141414', onPrimary: '#ffffff', primaryContainer: '#e9e9e9', onPrimaryContainer: '#141414',
    secondary: '#5c5c5c', onSecondary: '#ffffff', secondaryContainer: '#e9e9e9', onSecondaryContainer: '#141414',
    tertiary: '#155a38', onTertiary: '#ffffff', tertiaryContainer: '#e6f3eb', onTertiaryContainer: '#155a38',
    error: '#9f2d1c', onError: '#ffffff', errorContainer: '#fce9e6', onErrorContainer: '#65190f',
    background: '#f5f5f5', onBackground: '#141414', surface: '#ffffff', onSurface: '#141414',
    surfaceVariant: '#e9e9e9', onSurfaceVariant: '#5c5c5c', outline: '#777777', outlineVariant: '#d9d9d9',
    shadow: '#000000', scrim: '#00000080', inverseSurface: '#2b2b2b', inverseOnSurface: '#f5f5f5', inversePrimary: '#d9d9d9',
    elevation: { level0: '#ffffff', level1: '#fcfcfc', level2: '#f9f9f9', level3: '#f6f6f6', level4: '#f3f3f3', level5: '#f0f0f0' },
  };
  return { ...base, colors: { ...base.colors, ...colors } };
}
export const tabs = [
  { key: 'snaps', title: 'Snaps', focusedIcon: 'inbox', unfocusedIcon: 'inbox-outline' },
  { key: 'mates', title: 'Mates', focusedIcon: 'account-group', unfocusedIcon: 'account-group-outline' },
  { key: 'camera', title: 'Camera', focusedIcon: 'camera', unfocusedIcon: 'camera-outline' },
  { key: 'study', title: 'Study', focusedIcon: 'book-open-page-variant', unfocusedIcon: 'book-open-page-variant-outline' },
  { key: 'profile', title: 'Profile', focusedIcon: 'account-circle', unfocusedIcon: 'account-circle-outline' },
];
export const styles = StyleSheet.create({
  flex: { flex: 1 }, row: { flexDirection: 'row' }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  page: { padding: 20, paddingBottom: 48, gap: 8, width: '100%', maxWidth: 860, alignSelf: 'center' },
  paragraph: { marginVertical: 12 }, section: { marginTop: 24, marginBottom: 8 }, action: { marginTop: 20, marginBottom: 12, minHeight: 48, justifyContent: 'center' },
  field: { marginVertical: 8, minHeight: 56 }, editor: { minHeight: 240, marginVertical: 16 },
  authScroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 20 },
  authPage: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16 },
  authBrand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  authMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  authCard: { gap: 12, padding: 18, borderWidth: 1, borderRadius: 20 },
  authHeading: { gap: 4, marginTop: 4 },
  authAddressButton: { alignSelf: 'flex-start' },
  authGroup: { gap: 4 },
  authField: { minHeight: 56 },
  authTarget: { minHeight: 48, justifyContent: 'center' },
  authSubmit: { marginTop: 4, borderRadius: 12 },
  authError: { padding: 12, borderRadius: 8 },
  workspaceProgress: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
  panel: { padding: 24, borderRadius: 16, marginVertical: 16 }, listItem: { paddingVertical: 20, gap: 12 }, code: { letterSpacing: 2, marginVertical: 16 },
  photo: { width: '100%', aspectRatio: 0.8, resizeMode: 'contain', borderRadius: 16, marginVertical: 16 },
  capturePreview: { maxHeight: 280 },
  permission: { flex: 1, justifyContent: 'center', padding: 28, gap: 12 }, cameraTop: { alignItems: 'center', paddingTop: 16 },
  cameraTools: { position: 'absolute', top: 68, right: 12, alignItems: 'center', gap: 8 },
  cameraShutter: { position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' },
  choice: { minHeight: 56, marginVertical: 4, borderRadius: 12 }, timer: { flexDirection: 'row', padding: 16, alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  drawer: { width: 200, paddingTop: 16 }, calendar: { flexDirection: 'row', gap: 4, paddingVertical: 16 }, week: { gap: 4 }, day: { width: 12, height: 12, borderRadius: 2 },
});
