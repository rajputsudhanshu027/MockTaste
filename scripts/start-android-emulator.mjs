import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const tools = path.join(root, '.android-tools');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(tools, 'sdk');
const java = process.env.JAVA_HOME || path.join(tools, 'jdk');
const avds = path.join(tools, 'avd');
const avd = path.join(avds, 'mocktaste-check.avd');
const image = 'system-images;android-36;google_apis;x86_64';
const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, ANDROID_USER_HOME: path.join(tools, 'android-user'), ANDROID_AVD_HOME: avds };
if (!fs.existsSync(path.join(sdk, 'system-images/android-36/google_apis/x86_64/package.xml'))) throw new Error(`Install ${image} with sdkmanager first.`);
fs.mkdirSync(avds, { recursive: true });
function run(args, options = {}) {
  const result = spawnSync('rtk', ['proxy', ...args], { cwd: root, env, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!fs.existsSync(path.join(avd, 'config.ini'))) {
  run([path.join(sdk, 'cmdline-tools/latest/bin/avdmanager'), 'create', 'avd', '--name', 'mocktaste-check', '--package', image, '--device', 'pixel_6', '--path', avd], { input: 'no\n', stdio: ['pipe', 'inherit', 'inherit'] });
}
console.log('Starting dedicated Android emulator emulator-5556. Keep this process running during device checks.');
run([path.join(sdk, 'emulator/emulator'), '-avd', 'mocktaste-check', '-port', '5556', '-no-audio', '-no-boot-anim', '-no-snapshot', '-gpu', 'swiftshader', '-memory', '2048', '-cores', '2', '-camera-back', 'emulated', '-camera-front', 'emulated', ...(process.argv.includes('--window') ? [] : ['-no-window'])]);
