import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

import type { Repos } from '../db/context';
import { buildBackupJson } from './format';
import { applyRestore, type RestoreFileOps } from './restore';
import { createBackupZip, readBackupZip } from './zip';

const IMAGES_DIR = 'images';

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

export async function exportBackup(repos: Pick<Repos, 'recipes' | 'categories' | 'settings'>): Promise<void> {
  const now = new Date();
  const [categories, recipes] = await Promise.all([repos.categories.list(), repos.recipes.all()]);
  const zip = await createBackupZip(buildBackupJson(categories, recipes, now), readImage);
  const out = new File(Paths.cache, backupFileName(now));
  if (out.exists) out.delete();
  out.create();
  await out.write(zip);
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

function deviceFileOps(): RestoreFileOps {
  const staging = new Directory(Paths.cache, `restore-${Date.now()}`);
  const staged: string[] = [];
  return {
    async stageImages(images) {
      new Directory(staging, IMAGES_DIR).create({ intermediates: true, idempotent: true });
      for (const [path, bytes] of images) {
        const f = new File(staging, path);
        f.create({ overwrite: true });
        await f.write(bytes);
        staged.push(path);
      }
    },
    async deleteCurrentImages() {
      const dir = new Directory(Paths.document, IMAGES_DIR);
      if (dir.exists) dir.delete();
    },
    async installStagedImages() {
      new Directory(Paths.document, IMAGES_DIR).create({ intermediates: true, idempotent: true });
      for (const path of staged) {
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
  let bytes: Uint8Array;
  try {
    bytes = await pickedFile.bytes();
  } finally {
    // copyToCacheDirectory made a private copy; drop it once read.
    try {
      if (pickedFile.exists) pickedFile.delete();
    } catch {
      // best effort
    }
  }
  const { file, images } = readBackupZip(bytes);

  const current = await repos.recipes.count();
  if (!(await confirmRestore(current, file.recipes.length))) return 'cancelled';

  await applyRestore(file, images, {
    db: repos.db,
    recipes: repos.recipes,
    categories: repos.categories,
    settings: repos.settings,
    files: deviceFileOps(),
  });
  return 'restored';
}
