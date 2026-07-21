const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const REMOVED_INFO_KEYS = [
  'NSAppTransportSecurity',
  'NSAudioCaptureUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
];

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = join(context.appOutDir, `${appName}.app`);
  const infoPath = join(appPath, 'Contents', 'Info.plist');

  for (const key of REMOVED_INFO_KEYS) {
    const present = spawnSync('plutil', ['-extract', key, 'raw', '-o', '-', infoPath], {
      encoding: 'utf8',
    });
    if (present.status !== 0) continue;

    const removed = spawnSync('plutil', ['-remove', key, infoPath], { encoding: 'utf8' });
    if (removed.status !== 0) {
      throw new Error(`无法从 macOS Info.plist 删除 ${key}：${removed.stderr.trim()}`);
    }
  }

  // Workspaces managed by Finder/File Provider can add FinderInfo, resource forks,
  // provenance, or similar extended attributes while Electron is unpacked. Apple
  // rejects those attributes before Developer ID signing, so remove them from the
  // completed app bundle immediately before electron-builder starts codesign.
  const stripped = spawnSync('xattr', ['-cr', appPath], { encoding: 'utf8' });
  if (stripped.status !== 0) {
    throw new Error(`无法清理 macOS app 扩展属性：${stripped.stderr.trim()}`);
  }
};
