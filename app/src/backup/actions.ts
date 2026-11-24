import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, FileMode, Paths, type FileHandle } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

import type { Repos } from '../db/context';
import { IMAGES_DIR } from '../files/images';
import { buildBackupJson } from './format';
import { applyRestore, type RestoreFileOps } from './restore';
import { openBackupZip, writeBackupZip, type ByteSink, type ByteSource } from './zip';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function backupFileName(d: Date): string {
  return `recepty-zaloha-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.zip`;
}

async function readImage(path: string): Promise<Uint8Array | null> {
  const file = new File(Paths.document, path);
  if (!file.exists) return null;
  return file.bytes();
}

/** Creates (or truncates) `file` and returns a sink writing to it through a FileHandle. */
function fileSink(file: File): ByteSink {
  file.create({ overwrite: true, intermediates: true });
  const handle = file.open(FileMode.WriteOnly);
  let closed = false;
  return {
    write: (chunk) => handle.writeBytes(chunk),
    async close() {
      if (closed) return;
      closed = true;
      handle.close();
    },
  };
}

function handleSource(handle: FileHandle): ByteSource {
  return {
    size: handle.size ?? 0,
    async read(offset, length) {
      handle.offset = offset;
      return handle.readBytes(length);
    },
  };
}

export async function exportBackup(repos: Pick<Repos, 'recipes' | 'categories' | 'settings'>): Promise<void> {
  const now = new Date();
  const [categories, recipes] = await Promise.all([repos.categories.list(), repos.recipes.all()]);
  const out = new File(Paths.cache, backupFileName(now));
  const sink = fileSink(out);
  try {
    await writeBackupZip(buildBackupJson(categories, recipes, now), readImage, sink);
  } catch (e) {
    await sink.close();
    if (out.exists) out.delete();
    throw e;
  }
  await sink.close();
  await Sharing.shareAsync(out.uri, {
    mimeType: 'application/zip',
    dialogTitle: 'Uložiť zálohu receptov',
  });
  await repos.settings.set('lastBackupAt', new Date().toISOString());
}

function confirmRestore(current: number, incoming: number): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Obnoviť zálohu?',
      `Aktuálne recepty (${current}) sa nahradia receptami zo zálohy (${incoming}).`,
      [
        { text: 'Zrušiť', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Obnoviť', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

function deviceFileOps(extract: (openSink: (name: string) => Promise<ByteSink>) => Promise<void>): RestoreFileOps {
  const staging = new Directory(Paths.cache, `restore-${Date.now()}`);
  const staged: string[] = [];
  return {
    async stageImages() {
      new Directory(staging, IMAGES_DIR).create({ intermediates: true, idempotent: true });
      await extract(async (name) => {
        staged.push(name);
        return fileSink(new File(staging, name));
      });
    },
    async deleteCurrentImages() {
      const dir = new Directory(Paths.document, IMAGES_DIR);
      if (dir.exists) dir.delete();
    },
    async installStagedImages() {
      new Directory(Paths.document, IMAGES_DIR).create({ intermediates: true, idempotent: true });
      for (const path of new Set(staged)) {
        await new File(staging, path).move(new File(Paths.document, path));
      }
    },
    async removeStaged() {
      if (staging.exists) staging.delete();
    },
  };
}

export async function restoreBackup(repos: Repos): Promise<'restored' | 'cancelled'> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || picked.assets.length === 0) return 'cancelled';

  const pickedFile = new File(picked.assets[0].uri);
  const handle = pickedFile.open(FileMode.ReadOnly);
  try {
    // Reads and validates backup.json only; images are streamed later, straight into staging.
    const backup = await openBackupZip(handleSource(handle));

    const current = await repos.recipes.count();
    if (!(await confirmRestore(current, backup.file.recipes.length))) return 'cancelled';

    await applyRestore(backup.file, {
      db: repos.db,
      recipes: repos.recipes,
      categories: repos.categories,
      settings: repos.settings,
      files: deviceFileOps(backup.extractImages),
    });
    return 'restored';
  } finally {
    // copyToCacheDirectory made a private copy; drop it.
    try {
      handle.close();
      if (pickedFile.exists) pickedFile.delete();
    } catch {
      // best effort
    }
  }
}
