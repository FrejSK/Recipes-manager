import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { DbContext, type Repos } from '../src/db/context';
import { BackupBanner } from '../src/ui/BackupBanner';

const mockExport = jest.fn(async () => undefined);
jest.mock('../src/backup/actions', () => ({ exportBackup: (...a: unknown[]) => (mockExport as any)(...a) }));
jest.mock('expo-router', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, []) };
});

const TEXT = 'Recepty sú zatiaľ iba v tomto telefóne. Zálohuj si ich.';
const DAY = 86_400_000;

function makeRepos(values: Record<string, string | null>, count = 3) {
  const store = new Map(Object.entries(values).filter(([, v]) => v !== null) as [string, string][]);
  const set = jest.fn(async (k: string, v: string) => {
    store.set(k, v);
  });
  const repos = {
    recipes: { count: async () => count },
    categories: {},
    settings: { get: async (k: string) => store.get(k) ?? null, set },
  } as unknown as Repos;
  return { repos, set };
}

const renderBanner = (repos: Repos) =>
  render(
    <DbContext.Provider value={repos}>
      <BackupBanner />
    </DbContext.Provider>,
  );

const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

beforeEach(() => jest.clearAllMocks());

describe('BackupBanner', () => {
  it('shows when a reminder is due', async () => {
    const { repos } = makeRepos({ installedAt: ago(40), lastRecipeChangeAt: ago(35) });
    await renderBanner(repos);
    expect(await screen.findByText(TEXT)).toBeTruthy();
    expect(screen.getByText('Zálohovať')).toBeTruthy();
    expect(screen.getByText('Neskôr')).toBeTruthy();
  });

  it('stays hidden when not due', async () => {
    const { repos } = makeRepos({ installedAt: ago(5), lastRecipeChangeAt: ago(1) });
    await renderBanner(repos);
    await waitFor(() => expect(screen.queryByText(TEXT)).toBeNull());
  });

  it('treats a missing installedAt as now (no banner)', async () => {
    const { repos } = makeRepos({ installedAt: null, lastRecipeChangeAt: ago(35) });
    await renderBanner(repos);
    await waitFor(() => expect(screen.queryByText(TEXT)).toBeNull());
  });

  it('Neskôr stores lastBackupDismissedAt and hides', async () => {
    const { repos, set } = makeRepos({ installedAt: ago(40), lastRecipeChangeAt: ago(35) });
    await renderBanner(repos);
    await fireEvent.press(await screen.findByText('Neskôr'));
    expect(set).toHaveBeenCalledWith('lastBackupDismissedAt', expect.any(String));
    expect(screen.queryByText(TEXT)).toBeNull();
  });

  it('Zálohovať runs exportBackup and hides on success', async () => {
    const { repos } = makeRepos({ installedAt: ago(40), lastRecipeChangeAt: ago(35) });
    await renderBanner(repos);
    await fireEvent.press(await screen.findByText('Zálohovať'));
    expect(mockExport).toHaveBeenCalledWith(repos);
    await waitFor(() => expect(screen.queryByText(TEXT)).toBeNull());
  });
});
