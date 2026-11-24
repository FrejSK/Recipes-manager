import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Text } from 'react-native';

import { createCategoriesRepo, type CategoriesRepo } from './categories-repo';
import { openExpoDb } from './expo-db';
import { migrate } from './migrations';
import { createRecipesRepo, type RecipesRepo } from './recipes-repo';
import { createSettingsRepo, type SettingsRepo } from './settings-repo';

export type Repos = {
  recipes: RecipesRepo;
  categories: CategoriesRepo;
  settings: SettingsRepo;
};

export const DbContext = createContext<Repos | null>(null);

export function DbProvider({ children }: { children: ReactNode }) {
  const [repos, setRepos] = useState<Repos | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openExpoDb();
        await migrate(db);
        const settings = createSettingsRepo(db);
        const value: Repos = {
          recipes: createRecipesRepo(db, settings),
          categories: createCategoriesRepo(db),
          settings,
        };
        if (!cancelled) setRepos(value);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <Text>Databázu sa nepodarilo otvoriť.</Text>;
  if (!repos) return null;
  return <DbContext.Provider value={repos}>{children}</DbContext.Provider>;
}

export function useRepos(): Repos {
  const repos = useContext(DbContext);
  if (!repos) throw new Error('useRepos must be used inside DbProvider');
  return repos;
}
