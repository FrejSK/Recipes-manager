import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import SettingsScreen from '../app/settings';
import { BackupFormatError } from '../src/backup/format';
import { DbContext, type Repos } from '../src/db/context';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  };
});
const mockExport = jest.fn();
const mockRestore = jest.fn();
jest.mock('../src/backup/actions', () => ({
  exportBackup: (...a: unknown[]) => mockExport(...a),
  restoreBackup: (...a: unknown[]) => mockRestore(...a),
}));

function makeRepos(lastBackupAt: string | null) {
  const store = new Map<string, string>();
  if (lastBackupAt) store.set('lastBackupAt', lastBackupAt);
  return {
    recipes: {},
    categories: {},
    settings: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => {
        store.set(k, v);
      },
    },
  } as unknown as Repos;
}

const renderScreen = (repos: Repos) =>
  render(
    <DbContext.Provider value={repos}>
      <SettingsScreen />
    </DbContext.Provider>,
  );

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

it('links to categories', async () => {
  await renderScreen(makeRepos(null));
  await fireEvent.press(screen.getByText('Kategórie'));
  expect(mockPush).toHaveBeenCalledWith('/categories');
});

it('shows that there is no backup yet', async () => {
  await renderScreen(makeRepos(null));
  expect(await screen.findByText('Zatiaľ žiadna záloha')).toBeTruthy();
  expect(screen.getByText('Zálohovať recepty')).toBeTruthy();
  expect(screen.getByText('Obnoviť zo zálohy')).toBeTruthy();
});

it('shows the last backup date', async () => {
  await renderScreen(makeRepos(new Date(2026, 10, 24, 12).toISOString()));
  expect(await screen.findByText('Posledná záloha: 24. 11. 2026')).toBeTruthy();
});

it('exports and refreshes the last backup date', async () => {
  const repos = makeRepos(null);
  mockExport.mockImplementationOnce(async () => {
    await repos.settings.set('lastBackupAt', new Date(2026, 10, 24, 12).toISOString());
  });
  await renderScreen(repos);
  await fireEvent.press(await screen.findByText('Zálohovať recepty'));
  expect(mockExport).toHaveBeenCalledWith(repos);
  expect(await screen.findByText('Posledná záloha: 24. 11. 2026')).toBeTruthy();
});

it('shows a generic error when export fails', async () => {
  mockExport.mockRejectedValueOnce(new Error('io'));
  await renderScreen(makeRepos(null));
  await fireEvent.press(await screen.findByText('Zálohovať recepty'));
  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Záloha', 'Zálohu sa nepodarilo vytvoriť.'));
});

it('confirms a successful restore', async () => {
  mockRestore.mockResolvedValueOnce('restored');
  const repos = makeRepos(null);
  await renderScreen(repos);
  await fireEvent.press(await screen.findByText('Obnoviť zo zálohy'));
  expect(mockRestore).toHaveBeenCalledWith(repos);
  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Záloha', 'Recepty boli obnovené.'));
});

it('stays quiet when restore is cancelled', async () => {
  mockRestore.mockResolvedValueOnce('cancelled');
  await renderScreen(makeRepos(null));
  await fireEvent.press(await screen.findByText('Obnoviť zo zálohy'));
  await waitFor(() => expect(mockRestore).toHaveBeenCalled());
  expect(alertSpy).not.toHaveBeenCalled();
});

it('shows the format error message for a bad backup file', async () => {
  mockRestore.mockRejectedValueOnce(new BackupFormatError());
  await renderScreen(makeRepos(null));
  await fireEvent.press(await screen.findByText('Obnoviť zo zálohy'));
  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Záloha', 'Súbor nie je záloha receptov.'));
});

it('shows a generic error when restore fails', async () => {
  mockRestore.mockRejectedValueOnce(new Error('db'));
  await renderScreen(makeRepos(null));
  await fireEvent.press(await screen.findByText('Obnoviť zo zálohy'));
  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Záloha', 'Zálohu sa nepodarilo obnoviť.'));
});

it('disables both buttons while an operation runs', async () => {
  let finish!: () => void;
  mockExport.mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
  await renderScreen(makeRepos(null));
  await fireEvent.press(await screen.findByText('Zálohovať recepty'));
  await fireEvent.press(screen.getByText('Obnoviť zo zálohy'));
  await fireEvent.press(screen.getByText('Zálohovať recepty'));
  expect(mockRestore).not.toHaveBeenCalled();
  expect(mockExport).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(screen.getByText('Zálohovať recepty')).toBeTruthy());
});
