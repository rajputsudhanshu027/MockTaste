import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const mobile = path.join(root, 'mobile');
const tools = path.join(root, '.android-tools');
const flags = process.argv.slice(2);
if (flags.some(flag => flag !== '--https-only')) throw new Error('Usage: npm run apk -- [--https-only]');
const localNetwork = !flags.includes('--https-only');
const java = process.env.JAVA_HOME || path.join(tools, 'jdk');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(tools, 'sdk');
if (!fs.existsSync(path.join(java, 'bin', 'java')) || !fs.existsSync(path.join(sdk, 'platform-tools', 'adb'))) {
  throw new Error('Install the JDK and Android SDK first. See mobile/README.md.');
}
const env = {
  ...process.env, CI: '1', NODE_ENV: 'production', JAVA_HOME: java,
  ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk,
  ANDROID_USER_HOME: process.env.ANDROID_USER_HOME || path.join(tools, 'android-user'),
  GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || path.join(tools, 'gradle'),
  MOCKTASTE_LOCAL_NETWORK: localNetwork ? '1' : '0',
  PATH: [path.join(java, 'bin'), path.join(sdk, 'platform-tools'), process.env.PATH].join(path.delimiter),
};
function run(args, cwd) {
  const result = spawnSync('rtk', args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(['npx', 'expo', 'prebuild', '--platform', 'android', '--no-install'], mobile);
run(['proxy', './gradlew', ':app:assembleRelease', '--no-daemon', '--console=plain', '--max-workers=2', '-PreactNativeArchitectures=arm64-v8a,x86_64'], path.join(mobile, 'android'));
const output = path.join(root, 'artifacts', localNetwork ? 'MockTaste-android-preview.apk' : 'MockTaste-android-https.apk');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.copyFileSync(path.join(mobile, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), output);
console.log(`APK ready: ${output}\nInternal testing build, signed with the local debug key. No Metro server required.`);
