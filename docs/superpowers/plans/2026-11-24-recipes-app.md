# Recepty pre mamu – plán implementácie

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android aplikácia (Expo, pripravená aj na iOS), do ktorej mama ukladá recepty z obrázkov, textu a URL v jednotnom formáte, s vyhľadávaním, kategóriami, prepočtom porcií a zálohou.

**Architecture:** npm workspace s tromi balíkmi: `core` (čistá TS logika a kontrakt API, bez závislostí na platforme), `server` (Cloudflare Worker, ktorý volá Claude a vracia JSON receptu) a `app` (Expo/React Native, SQLite v telefóne). Všetky tri importy (obrázky, text, URL) idú cez `POST /extract` a končia vo formulári na kontrolu.

**Tech Stack:** TypeScript (strict), Expo + expo-router, expo-sqlite, expo-file-system, expo-image-picker, expo-image-manipulator, expo-keep-awake, expo-sharing, expo-document-picker, expo-share-intent, fflate, zod, Cloudflare Workers (wrangler, KV), `@anthropic-ai/sdk`, vitest (core, server), jest-expo + @testing-library/react-native + better-sqlite3 (app).

**Spec:** `docs/superpowers/specs/2026-11-24-recipes-app-design.md`

## Global Constraints

- TypeScript `strict: true` vo všetkých balíkoch.
- Celé rozhranie je po slovensky. Písmo bežnej veľkosti (systémové predvolené).
- AI model: `claude-opus-5-5`, `output_config.effort: "low"`, štruktúrovaný výstup cez `client.messages.parse` + `zodOutputFormat`. AI kľúč existuje iba ako secret Workera (`ANTHROPIC_API_KEY`).
- Aplikácia pozná len `EXPO_PUBLIC_EXTRACT_URL` a `EXPO_PUBLIC_APP_TOKEN` (z `.env`, ktorý sa necommituje).
- Server recepty neukladá. Denný limit volaní `DAILY_LIMIT` = 50.
- V databáze ani v zálohe nie sú absolútne cesty. Obrázky sú uložené ako `images/<uuid>.jpg` relatívne k `FileSystem.documentDirectory`.
- Android je hlavná platforma. Žiadny kód nesmie iOS vylučovať. Na API, ktoré existujú len na jednej platforme (napr. `Alert.prompt`), sa nespoliehame.
- Predvolené kategórie (v tomto poradí): Polievky, Hlavné jedlá, Prílohy, Šaláty, Koláče a dezerty, Pečivo, Nápoje.
- Jednotky (kód → zobrazenie): `g` g, `kg` kg, `ml` ml, `dl` dl, `l` l, `ks` ks, `PL` PL, `CL` ČL, `KL` KL, `salka` šálka, `hrncek` hrnček, `balenie` balenie, `platok` plátok, `strucik` strúčik, `stipka` štipka, `hrst` hrsť, `konzerva` konzerva.
- AI recept neprekladá, nevymýšľa chýbajúce údaje a navrhuje iba kategórie zo zoznamu, ktorý pošle aplikácia.

## Review Focus

1. **Veľmi dlhý screenshot (napr. 1080×6000)** sa rozdelí na viac častí, nezmenší sa na nečitateľný prúžok → test v Task 3 (`planImageTiles`).
2. **Recept bez porcií alebo surovina bez množstva:** −/+ sa neukáže, „soľ podľa chuti“ sa zobrazí bez čísla a nič nespadne → testy v Task 2 a Task 11.
3. **Zdieľaný text „Názov\nhttps://…“ z Chromu alebo Facebooku** sa spracuje ako odkaz, dlhý text s odkazom uprostred ako text → test v Task 3 (`classifySharedText`).
4. **Stránka s viacerými JSON-LD blokmi, `@graph` alebo `"@type": ["Recipe"]`** recept aj tak nájde → testy v Task 5.
5. **Zmazanie kategórie nezmaže recepty. Zmazanie receptu zmaže jeho obrázky. Obnova zálohy po preinštalovaní** má platné cesty k obrázkom → testy v Task 9 a Task 16.

## Kroky, ktoré robí vývojár sám (mimo kódu)

Plán ich pripomenie v úlohách, kde sú potrebné.

- **K1 – Anthropic:** v console.anthropic.com vytvor API kľúč a nastav mesačný limit míňania (návrh: 5 $).
- **K2 – Cloudflare:** založ bezplatný účet a spusti `npx wrangler login`.
- **K3 – Expo:** založ účet na expo.dev a spusti `npx eas login`.
- **K4 – Telefón:** na testovacom Androide (aj na maminom) povoľ inštaláciu z neznámych zdrojov pre prehliadač alebo správcu súborov.

## Pre Javistu: krátky slovník

- **npm workspaces** ≈ Maven multi-module: jeden koreňový `package.json`, balíky sa navzájom importujú podľa mena (`@recipes/core`).
- **zod** ≈ Bean Validation + DTO v jednom: zo schémy sa odvodí TS typ (`z.infer<typeof Schema>`) aj runtime validácia.
- **vitest / jest** ≈ JUnit. `expect(x).toBe(y)` ≈ `assertEquals(y, x)`.
- **React komponent** je funkcia, ktorá vracia UI. **Hook** (`useXxx`) je funkcia so stavom alebo s vedľajšími účinkami, volá sa iba z komponentu.
- **Expo Go vs. development build:** Expo Go je hotová appka na skúšanie, ale nevie prijímať „Zdieľať“. Preto si cez EAS zostavíme vlastnú vývojovú appku (APK) a nainštalujeme ju do telefónu.

---

## Štruktúra súborov

```
package.json                  # workspaces: core, server, app
tsconfig.base.json
core/
  package.json                # name @recipes/core, main src/index.ts
  src/index.ts                # re-exporty
  src/units.ts                # UNITS, UnitCode, unitLabel()
  src/recipe.ts               # Recipe, RecipeInput, Ingredient, IngredientGroup, Category
  src/extract-contract.ts     # zod schémy ExtractRequest/ExtractResponse/ExtractedRecipe, chybové kódy
  src/scale.ts                # scaleIngredient, formatAmount, formatIngredient
  src/search.ts               # normalizeText, filterRecipes
  src/share.ts                # classifySharedText
  src/categories.ts           # DEFAULT_CATEGORIES, mapCategoryNames
  src/tiles.ts                # planImageTiles
  src/backup-reminder.ts      # shouldRemindBackup
  test/*.test.ts
server/
  package.json, wrangler.toml, .dev.vars.example
  src/index.ts                # Worker entry: env → handleRequest
  src/handler.ts              # handleRequest(request, deps): auth, limit, validácia, routing
  src/rate-limit.ts           # checkAndCount(kv, limit, now)
  src/jsonld.ts               # findRecipeJsonLd, jsonLdToText, findOgImage
  src/html-text.ts            # htmlToText, decodeEntities
  src/fetch-page.ts           # fetchPage(url)
  src/ai.ts                   # RecipeAI interface + createClaudeAI(apiKey)
  src/prompt.ts               # SYSTEM_PROMPT
  src/extract.ts              # extract(request, deps) – orchestrácia
  test/*.test.ts, test/fixtures/*.html
  scripts/smoke.ts            # ručný test proti skutočnému Claude
app/
  package.json, app.json, eas.json, .env.example, jest.config.js, metro.config.js
  app/_layout.tsx             # Stack, init DB, share intent
  app/index.tsx               # zoznam
  app/recipe/[id].tsx         # detail
  app/recipe/[id]/edit.tsx    # úprava
  app/new.tsx                 # nový recept (prázdny alebo draft z importu)
  app/add.tsx                 # výber zdroja, vloženie textu/odkazu
  app/import.tsx              # „Čítam recept…“ + chyby
  app/categories.tsx
  app/settings.tsx            # záloha
  src/db/sql.ts               # SqlDb interface
  src/db/expo-db.ts           # adaptér expo-sqlite
  src/db/migrations.ts        # migrate(db)
  src/db/recipes-repo.ts
  src/db/categories-repo.ts
  src/db/settings-repo.ts
  src/db/context.tsx          # DbProvider, useRepos()
  src/files/images.ts         # saveImage, imageUri, deleteImages
  src/recipe/draft.ts         # RecipeDraft, ImageRef, emptyDraft, extractedToDraft, recipeToDraft
  src/recipe/save.ts          # saveDraft
  src/import/pending.ts       # setPendingImport/takePendingImport, setDraft/takeDraft
  src/import/prepare-images.ts
  src/import/extract-client.ts
  src/import/messages.ts
  src/backup/format.ts        # BackupFile, buildBackupJson, parseBackupJson
  src/backup/zip.ts           # createBackupZip, readBackupZip
  src/backup/actions.ts       # exportBackup, restoreBackup (UI + súbory)
  src/ui/RecipeForm.tsx, IngredientsEditor.tsx, StepsEditor.tsx, CategoryChips.tsx, BackupBanner.tsx
  test/*.test.ts(x), test/sqlite-node.ts
```

---

### Task 1: Monorepo a balík core (typy, jednotky, kontrakt API)

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore` (doplniť `node_modules`, `.env`, `.dev.vars`, `.wrangler`, `app/android`, `app/ios`)
- Create: `core/package.json`, `core/tsconfig.json`, `core/src/index.ts`, `core/src/units.ts`, `core/src/recipe.ts`, `core/src/extract-contract.ts`
- Test: `core/test/units.test.ts`, `core/test/extract-contract.test.ts`

**Interfaces:**
- Produces:
  - `type UnitCode = 'g'|'kg'|'ml'|'dl'|'l'|'ks'|'PL'|'CL'|'KL'|'salka'|'hrncek'|'balenie'|'platok'|'strucik'|'stipka'|'hrst'|'konzerva'`
  - `UNIT_CODES: readonly UnitCode[]`
  - `UNITS: Record<UnitCode, { forms: { one: string; few: string; many: string; fraction: string }; kind: 'metric'|'measure'|'piece'; scalable: boolean }>`
  - `unitLabel(code: UnitCode, value: number): string`
  - `type Ingredient = { amount: number|null; amountMax: number|null; unit: UnitCode|null; name: string; note: string|null }`
  - `type IngredientGroup = { name: string|null; items: Ingredient[] }`
  - `type Category = { id: string; name: string; sortOrder: number }`
  - `type Recipe` presne podľa spec (polia `id, title, servings, prepMinutes, cookMinutes, totalMinutes, ingredientGroups, steps, categoryIds, notes, photo, sourceImages, sourceUrl, sourceText, createdAt, updatedAt`)
  - `type RecipeInput = Omit<Recipe, 'id'|'createdAt'|'updatedAt'>`
  - `ExtractedRecipeSchema` (zod): `{ title: string; servings: int|null; prepMinutes: int|null; cookMinutes: int|null; totalMinutes: int|null; ingredientGroups: IngredientGroup[]; steps: string[]; categoryNames: string[] }`, `type ExtractedRecipe`
  - `ExtractRequestSchema` (zod, diskriminované podľa `kind`):
    `{ kind: 'images'; images: { mediaType: 'image/jpeg'|'image/png'|'image/webp'; data: string }[] (1–20); categories: string[] }`
    `| { kind: 'text'; text: string (1–100000 znakov); categories: string[] }`
    `| { kind: 'url'; url: string (http/https); categories: string[] }`, `type ExtractRequest = z.infer<typeof ExtractRequestSchema>`
  - `type ExtractResponse = { recipe: ExtractedRecipe; photoUrl: string|null }`
  - `type ExtractErrorCode = 'bad_request'|'unauthorized'|'rate_limited'|'not_a_recipe'|'url_unreadable'|'ai_failed'`
  - `ERROR_STATUS: Record<ExtractErrorCode, number>` = bad_request 400, unauthorized 401, rate_limited 429, not_a_recipe 422, url_unreadable 422, ai_failed 502

Tvary slov pre `UNITS` (one / few = 2–4 / many = 0 a 5+ / fraction = neceločíselné):

| kód | one | few | many | fraction | kind | scalable |
|---|---|---|---|---|---|---|
| g, kg, ml, dl, l | = kód | = | = | = | metric | áno |
| ks, PL, KL | = kód | = | = | = | measure (ks: piece) | áno |
| CL | ČL | ČL | ČL | ČL | measure | áno |
| salka | šálka | šálky | šálok | šálky | measure | áno |
| hrncek | hrnček | hrnčeky | hrnčekov | hrnčeka | measure | áno |
| balenie | balenie | balenia | balení | balenia | piece | áno |
| platok | plátok | plátky | plátkov | plátku | piece | áno |
| strucik | strúčik | strúčiky | strúčikov | strúčika | piece | áno |
| stipka | štipka | štipky | štipiek | štipky | piece | **nie** |
| hrst | hrsť | hrste | hrstí | hrste | piece | áno |
| konzerva | konzerva | konzervy | konzerv | konzervy | piece | áno |

- [ ] **Step 1: Založ workspace.** Koreňový `package.json` s `"private": true`, `"workspaces": ["core", "server", "app"]` a skriptom `"test": "npm run test --workspaces --if-present"`. `core/package.json`: `name: "@recipes/core"`, `main: "src/index.ts"`, `types: "src/index.ts"`, závislosť `zod` (major verzia, ktorú vyžaduje `@anthropic-ai/sdk/helpers/zod`; over v peerDependencies SDK), dev `vitest`, `typescript`. Spusti `npm install`.

- [ ] **Step 2: Napíš padajúce testy**

```ts
// core/test/units.test.ts
import { describe, it, expect } from 'vitest';
import { UNIT_CODES, UNITS, unitLabel } from '../src';

describe('units', () => {
  it('has exactly the 17 units from the spec', () => {
    expect(UNIT_CODES).toHaveLength(17);
  });
  it('picks Slovak word forms by value', () => {
    expect(unitLabel('salka', 1)).toBe('šálka');
    expect(unitLabel('salka', 3)).toBe('šálky');
    expect(unitLabel('salka', 5)).toBe('šálok');
    expect(unitLabel('salka', 1.5)).toBe('šálky');
    expect(unitLabel('platok', 0.5)).toBe('plátku');
    expect(unitLabel('CL', 2)).toBe('ČL');
  });
  it('does not scale a pinch', () => {
    expect(UNITS.stipka.scalable).toBe(false);
    expect(UNITS.g.scalable).toBe(true);
  });
});
```

```ts
// core/test/extract-contract.test.ts
import { describe, it, expect } from 'vitest';
import { ExtractRequestSchema, ExtractedRecipeSchema } from '../src';

describe('extract contract', () => {
  it('accepts a url request', () => {
    const r = ExtractRequestSchema.safeParse({ kind: 'url', url: 'https://x.sk/r', categories: ['Polievky'] });
    expect(r.success).toBe(true);
  });
  it('rejects non-http url, empty text and 21 images', () => {
    expect(ExtractRequestSchema.safeParse({ kind: 'url', url: 'file:///etc/passwd', categories: [] }).success).toBe(false);
    expect(ExtractRequestSchema.safeParse({ kind: 'text', text: '', categories: [] }).success).toBe(false);
    const img = { mediaType: 'image/jpeg', data: 'AAAA' };
    expect(ExtractRequestSchema.safeParse({ kind: 'images', images: Array(21).fill(img), categories: [] }).success).toBe(false);
  });
  it('rejects an ingredient with an unknown unit', () => {
    const recipe = { title: 'X', servings: null, prepMinutes: null, cookMinutes: null, totalMinutes: null,
      ingredientGroups: [{ name: null, items: [{ amount: 1, amountMax: null, unit: 'tbsp', name: 'cukor', note: null }] }],
      steps: [], categoryNames: [] };
    expect(ExtractedRecipeSchema.safeParse(recipe).success).toBe(false);
  });
});
```

- [ ] **Step 3: Spusti testy a over, že padajú.** Príkaz: `npm test -w core`. Očakávanie: FAIL (moduly neexistujú).
- [ ] **Step 4: Implementuj `units.ts`, `recipe.ts`, `extract-contract.ts` a `index.ts`** podľa Interfaces a tabuľky vyššie. `unitLabel`: neceločíselná hodnota → `fraction`; 1 → `one`; 2–4 → `few`; inak → `many`.
- [ ] **Step 5: Spusti testy.** `npm test -w core`. Očakávanie: PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(core): workspace, units and extract contract"`

---

### Task 2: Core – prepočet a formátovanie množstiev

**Files:**
- Create: `core/src/scale.ts`
- Test: `core/test/scale.test.ts`

**Interfaces:**
- Consumes: `Ingredient`, `UnitCode`, `UNITS`, `unitLabel` (Task 1)
- Produces:
  - `scaleIngredient(item: Ingredient, factor: number): Ingredient`
  - `formatAmount(value: number, unit: UnitCode|null): string`
  - `formatIngredient(item: Ingredient, factor: number): { amountText: string; nameText: string }`

Pravidlá (spec: „pekné čísla“):
- `factor === 1` → množstvo sa nemení ani nezaokrúhľuje.
- `amount === null` alebo `unit` nie je scalable → položka sa vráti bez zmeny.
- Krok zaokrúhlenia podľa jednotky: `g`, `ml`: hodnota < 20 → 1, < 100 → 5, inak 10. `kg`, `l`, `dl` → 0,1. `PL`, `CL`, `KL`, `salka`, `hrncek` → 0,25. `ks`, `balenie`, `platok`, `strucik`, `hrst`, `konzerva` a `unit === null` → 0,5. Zaokrúhľuje sa na najbližší násobok kroku (polovica nahor). Nenulová hodnota nikdy neklesne na 0: ak by vyšla 0, použije sa krok.
- `amountMax` sa prepočíta rovnako.
- `formatAmount`: pri `kind === 'metric'` desatinná čiarka, najviac 2 desatinné miesta, bez koncových núl („0,5“, „1,5“, „1200“). Pri ostatných jednotkách a pri `null` sa zlomková časť v tolerancii 0,01 od ¼ ½ ¾ ⅓ ⅔ zobrazí znakom („1½“, „½“, „⅓“). Inak desatinná čiarka.
- `formatIngredient`: `amountText` = `""` bez množstva, inak `formatAmount(amount)` (+ `"–" + formatAmount(amountMax)`), + `" " + unitLabel(unit, amountMax ?? amount)`, ak je jednotka. `nameText` = `name` + `" (" + note + ")"`, ak je poznámka.

- [ ] **Step 1: Napíš padajúci test**

```ts
// core/test/scale.test.ts
import { describe, it, expect } from 'vitest';
import { formatIngredient } from '../src';
import type { Ingredient } from '../src';

const ing = (amount: number|null, unit: Ingredient['unit'], name = 'x', amountMax: number|null = null, note: string|null = null): Ingredient =>
  ({ amount, amountMax, unit, name, note });
const amt = (i: Ingredient, f: number) => formatIngredient(i, f).amountText;

describe('scaling', () => {
  it('keeps original values at factor 1', () => {
    expect(amt(ing(0.333, 'salka'), 1)).toBe('⅓ šálky');
    expect(amt(ing(800, 'g'), 1)).toBe('800 g');
  });
  it('rounds by unit', () => {
    expect(amt(ing(800, 'g'), 6 / 4)).toBe('1200 g');
    expect(amt(ing(250, 'g'), 1 / 3)).toBe('85 g');
    expect(amt(ing(15, 'g'), 1 / 2)).toBe('8 g');
    expect(amt(ing(1, 'CL'), 1.5)).toBe('1½ ČL');
    expect(amt(ing(3, null), 1 / 2)).toBe('1½');
    expect(amt(ing(1, 'ks'), 5 / 4)).toBe('1½ ks');
    expect(amt(ing(0.5, 'l'), 3)).toBe('1,5 l');
  });
  it('never rounds to zero', () => {
    expect(amt(ing(0.1, 'kg'), 1 / 4)).toBe('0,1 kg');
  });
  it('uses Slovak word forms after scaling', () => {
    expect(amt(ing(1, 'salka'), 2)).toBe('2 šálky');
    expect(amt(ing(1, 'salka'), 5)).toBe('5 šálok');
  });
  it('does not scale a pinch or an ingredient without amount', () => {
    expect(amt(ing(1, 'stipka'), 3)).toBe('1 štipka');
    expect(formatIngredient(ing(null, null, 'soľ', null, 'podľa chuti'), 2)).toEqual({ amountText: '', nameText: 'soľ (podľa chuti)' });
  });
  it('scales ranges', () => {
    expect(amt(ing(2, 'ks', 'x', 3), 2)).toBe('4–6 ks');
  });
});
```

- [ ] **Step 2: Spusti test a over, že padá.** `npm test -w core -- scale`. Očakávanie: FAIL.
- [ ] **Step 3: Implementuj `scaleIngredient`, `formatAmount`, `formatIngredient`** v `core/src/scale.ts` podľa pravidiel vyššie a exportuj ich z `index.ts`.
- [ ] **Step 4: Spusti testy.** `npm test -w core`. Očakávanie: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(core): ingredient scaling and formatting"` (nové súbory pridaj cez `git add core`).

---

### Task 3: Core – vyhľadávanie, zdieľaný text, kategórie, dlaždice obrázkov, pripomienka zálohy

**Files:**
- Create: `core/src/search.ts`, `core/src/share.ts`, `core/src/categories.ts`, `core/src/tiles.ts`, `core/src/backup-reminder.ts`
- Test: `core/test/search.test.ts`, `core/test/share.test.ts`, `core/test/categories.test.ts`, `core/test/tiles.test.ts`, `core/test/backup-reminder.test.ts`

**Interfaces:**
- Consumes: `Category` (Task 1)
- Produces:
  - `normalizeText(s: string): string`: NFD, odstránenie diakritiky (`\p{Diacritic}`), malé písmená, trim
  - `filterRecipes<T extends { title: string; categoryIds: string[] }>(items: T[], query: string, categoryId: string|null): T[]`: každé slovo dotazu musí byť obsiahnuté v normalizovanom názve. Prázdny dotaz prepustí všetko. `categoryId` filtruje podľa `categoryIds`. Výsledok je zoradený podľa normalizovaného názvu (`localeCompare` s `'sk'`).
  - `classifySharedText(text: string): { kind: 'url'; url: string } | { kind: 'text'; text: string }`: nájdi `https?://\S+`. Ak je presne jeden a text bez neho má po `trim()` najviac 200 znakov → `url`. Inak `text`.
  - `DEFAULT_CATEGORIES: readonly string[]` (zoznam z Global Constraints)
  - `mapCategoryNames(names: string[], categories: Category[]): string[]`: porovnáva cez `normalizeText`, neznáme mená zahodí, bez duplikátov, zachová poradie
  - `type Tile = { originX: number; originY: number; width: number; height: number }`
  - `planImageTiles(width: number, height: number): Tile[]`: `n = ceil(height / (2.5 * width))`. Pri `n === 1` vráti celý obrázok. Inak `base = ceil(height / n)`, `overlap = round(base * 0.05)` a dlaždica `i` má `originY = max(0, i*base - overlap)` a koniec `min(height, (i+1)*base + overlap)`. Pri `n > 20` vyhodí `Error('image_too_long')`.
  - `shouldRemindBackup(s: { now: Date; installedAt: Date; lastBackupAt: Date|null; lastDismissedAt: Date|null; lastChangeAt: Date|null; recipeCount: number }): boolean`: true iff `recipeCount ≥ 1` a `lastChangeAt > (lastBackupAt ?? -∞)` a od `max(installedAt, lastBackupAt, lastDismissedAt)` uplynulo ≥ 30 dní

- [ ] **Step 1: Napíš padajúce testy** (hlavné aserty):

```ts
// search.test.ts
expect(filterRecipes([{ title: 'Hovädzí guláš', categoryIds: [] }], 'gulas', null)).toHaveLength(1);
expect(filterRecipes([{ title: 'Hovädzí guláš', categoryIds: [] }], 'hov GUL', null)).toHaveLength(1);
expect(filterRecipes([{ title: 'Hovädzí guláš', categoryIds: ['a'] }], '', 'b')).toHaveLength(0);
expect(filterRecipes([{ title: 'Šalát', categoryIds: [] }, { title: 'Avokádo', categoryIds: [] }], '', null).map(r => r.title)).toEqual(['Avokádo', 'Šalát']);

// share.test.ts
expect(classifySharedText('Mrkvový koláč – Recepty\nhttps://www.recepty.sk/kolac')).toEqual({ kind: 'url', url: 'https://www.recepty.sk/kolac' });
expect(classifySharedText('https://x.sk/a https://x.sk/b').kind).toBe('text');
const long = 'Suroviny: ' + 'múka, '.repeat(50) + ' viac na https://x.sk';
expect(classifySharedText(long)).toEqual({ kind: 'text', text: long });
expect(classifySharedText('200 g múky, 2 vajcia').kind).toBe('text');

// categories.test.ts
const cats = [{ id: '1', name: 'Polievky', sortOrder: 0 }, { id: '2', name: 'Hlavné jedlá', sortOrder: 1 }];
expect(mapCategoryNames(['hlavne jedla', 'Neexistuje', 'Polievky', 'polievky'], cats)).toEqual(['2', '1']);

// tiles.test.ts
expect(planImageTiles(1080, 2400)).toEqual([{ originX: 0, originY: 0, width: 1080, height: 2400 }]);
const t = planImageTiles(1080, 6000);
expect(t).toHaveLength(3);
expect(t[0].originY).toBe(0);
expect(t[2].originY + t[2].height).toBe(6000);
for (let i = 1; i < t.length; i++) expect(t[i].originY).toBeLessThan(t[i - 1].originY + t[i - 1].height);
t.forEach(x => expect(x.height).toBeLessThanOrEqual(2.5 * 1080 * 1.1));
expect(() => planImageTiles(100, 100 * 2.5 * 21)).toThrow('image_too_long');

// backup-reminder.test.ts  (d(n) = Date n dní po 2026-01-01)
expect(shouldRemindBackup({ now: d(31), installedAt: d(0), lastBackupAt: null, lastDismissedAt: null, lastChangeAt: d(5), recipeCount: 3 })).toBe(true);
expect(shouldRemindBackup({ now: d(20), installedAt: d(0), lastBackupAt: null, lastDismissedAt: null, lastChangeAt: d(5), recipeCount: 3 })).toBe(false);
expect(shouldRemindBackup({ now: d(70), installedAt: d(0), lastBackupAt: d(40), lastDismissedAt: null, lastChangeAt: d(30), recipeCount: 3 })).toBe(false);
expect(shouldRemindBackup({ now: d(70), installedAt: d(0), lastBackupAt: d(10), lastDismissedAt: d(60), lastChangeAt: d(30), recipeCount: 3 })).toBe(false);
expect(shouldRemindBackup({ now: d(70), installedAt: d(0), lastBackupAt: null, lastDismissedAt: null, lastChangeAt: null, recipeCount: 0 })).toBe(false);
```

- [ ] **Step 2: Spusti testy a over, že padajú.** `npm test -w core`. Očakávanie: FAIL.
- [ ] **Step 3: Implementuj päť modulov** podľa Interfaces a exportuj ich z `index.ts`.
- [ ] **Step 4: Spusti testy.** `npm test -w core`. Očakávanie: PASS.
- [ ] **Step 5: Commit.** `git add core && git commit -m "feat(core): search, share classification, categories, image tiles, backup reminder"`

---

### Task 4: Server – kostra, autorizácia, denný limit, validácia

**Files:**
- Create: `server/package.json` (dep `@recipes/core`, `@anthropic-ai/sdk`, `zod`; dev `wrangler`, `vitest`, `typescript`, `@cloudflare/workers-types`), `server/tsconfig.json`, `server/wrangler.toml`, `server/.dev.vars.example`, `server/src/index.ts`, `server/src/handler.ts`, `server/src/rate-limit.ts`
- Test: `server/test/handler.test.ts`

**Interfaces:**
- Consumes: `ExtractRequestSchema`, `ExtractErrorCode`, `ERROR_STATUS`, `ExtractResponse` (Task 1)
- Produces:
  - `interface KVLike { get(key: string): Promise<string|null>; put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> }`
  - `checkAndCount(kv: KVLike, limit: number, now: Date): Promise<boolean>`: kľúč `count:YYYY-MM-DD` (UTC), TTL 172800 s. Vráti `false`, ak by počet prekročil limit, inak počet zvýši a vráti `true`.
  - `type ExtractResult = { ok: true; data: ExtractResponse } | { ok: false; error: ExtractErrorCode }`
  - `type Extractor = (req: ExtractRequest) => Promise<ExtractResult>`
  - `handleRequest(request: Request, deps: { appToken: string; dailyLimit: number; kv: KVLike; extract: Extractor; now: () => Date }): Promise<Response>`
  - Worker env: `ANTHROPIC_API_KEY`, `APP_TOKEN`, `DAILY_LIMIT` (var, "50"), KV binding `LIMITS`

Správanie `handleRequest`: iba `POST /extract`, inak 404. Hlavička `Authorization: Bearer <APP_TOKEN>`, inak 401 `{error:'unauthorized'}`. Telo nevalidné podľa schémy → 400 `{error:'bad_request'}`. Prekročený limit → 429 `{error:'rate_limited'}` (počíta sa až po autorizácii a validácii). Výsledok extraktora: úspech → 200 s `ExtractResponse`, chyba → `ERROR_STATUS[code]` s `{error: code}`. Výnimka v extraktore → 502 `{error:'ai_failed'}`. Všetky odpovede majú `Content-Type: application/json`.

- [ ] **Step 1: Napíš padajúce testy** v `handler.test.ts` s fake KV (Map) a fake extraktorom. Prípady a očakávania:
  - bez hlavičky → 401 `{error:'unauthorized'}`
  - zlý token → 401
  - `GET /extract` → 404
  - telo `{kind:'text', text:''}` → 400 `{error:'bad_request'}`
  - platný text, extraktor vráti `{ok:true, data}` → 200 a telo `data`
  - extraktor vráti `{ok:false, error:'not_a_recipe'}` → 422 `{error:'not_a_recipe'}`
  - extraktor vyhodí výnimku → 502 `{error:'ai_failed'}`
  - `dailyLimit: 2`, tri platné volania → tretie 429. Ďalší deň (`now` + 1 deň) → 200.
  - 401 a 400 sa do limitu nepočítajú (`dailyLimit: 1`, najprv 401, potom platné → 200)
- [ ] **Step 2: Spusti testy a over, že padajú.** `npm test -w server`. Očakávanie: FAIL.
- [ ] **Step 3: Implementuj `rate-limit.ts` a `handler.ts`.** `index.ts` (`export default { fetch(request, env) }`) poskladá `deps` z `env`. `extract` je zatiaľ funkcia, ktorá vracia `{ok:false, error:'ai_failed'}` a v Task 6 sa nahradí. `wrangler.toml`: `name = "recepty-extract"`, `main = "src/index.ts"`, `compatibility_flags = ["nodejs_compat"]`, `[vars] DAILY_LIMIT = "50"`, `[[kv_namespaces]] binding = "LIMITS"` (id doplní Task 7).
- [ ] **Step 4: Spusti testy.** `npm test -w server`. Očakávanie: PASS.
- [ ] **Step 5: Commit.** `git add server && git commit -m "feat(server): worker skeleton with auth, rate limit and validation"`

---

### Task 5: Server – JSON-LD recept a text stránky

**Files:**
- Create: `server/src/html-text.ts`, `server/src/jsonld.ts`
- Test: `server/test/jsonld.test.ts`, `server/test/html-text.test.ts`, `server/test/fixtures/jsonld-simple.html`, `jsonld-graph.html`, `jsonld-type-array.html`, `no-jsonld.html`

**Interfaces:**
- Produces:
  - `decodeEntities(s: string): string`: pomenované entity `&amp; &lt; &gt; &quot; &apos; &nbsp;` a číselné `&#NN;` / `&#xHH;`
  - `htmlToText(html: string): string`: odstráni `script/style/noscript/svg` aj s obsahom, `br/p/li/h1-6/div/tr` nahradí novým riadkom, ostatné tagy odstráni, dekóduje entity, zlúči medzery a viac ako dva nové riadky. Najviac 100 000 znakov.
  - `type JsonLdRecipe = { title: string; servingsText: string|null; prepMinutes: number|null; cookMinutes: number|null; totalMinutes: number|null; ingredients: string[]; steps: string[]; imageUrl: string|null }`
  - `findRecipeJsonLd(html: string): JsonLdRecipe|null`
  - `jsonLdToText(r: JsonLdRecipe): string`
  - `findOgImage(html: string): string|null`

Mapovanie JSON-LD: prejde všetky `<script type="application/ld+json">` (atribúty v ľubovoľnom poradí, veľkosť písmen ignoruje). Nevalidný JSON preskočí. Rozbalí polia aj `@graph`. Nájde uzol, kde `@type` je `"Recipe"` alebo pole obsahujúce `"Recipe"`. `recipeYield` (string, číslo alebo pole) → `servingsText` ako text prvej hodnoty. `prepTime/cookTime/totalTime` ISO 8601 (`PT1H30M`, `PT45M`, `P0DT2H`) → minúty. `recipeInstructions`: string (rozdelí po riadkoch), pole stringov, `HowToStep.text` alebo `HowToSection.itemListElement` (rekurzívne) → ploché pole krokov. `image`: string, `{url}` alebo pole → prvá URL. Všetky texty prejdú `decodeEntities` a odstránením tagov.

`jsonLdToText` vytvorí text pre AI:
```
Názov: {title}
Porcie: {servingsText}          (riadok len ak nie je null)
Čas prípravy: {prepMinutes} min (analogicky Čas varenia / Celkový čas)
Suroviny:
- {ingredient}
Postup:
1. {step}
```

- [ ] **Step 1: Priprav fixtures** (krátke ručne napísané HTML) a **napíš padajúce testy**:
  - `jsonld-simple.html`: Recipe s `recipeYield: "4 porcie"`, `totalTime: "PT1H30M"`, 3 suroviny, `recipeInstructions` ako pole `HowToStep`, `image: {url}`. Over `title`, `servingsText === '4 porcie'`, `totalMinutes === 90`, `ingredients.length === 3`, `steps[0]` a `imageUrl`.
  - `jsonld-graph.html`: dva bloky, prvý nevalidný JSON, druhý `@graph` s `WebPage` a `Recipe`. Recept sa nájde.
  - `jsonld-type-array.html`: `"@type": ["Recipe", "NewsArticle"]`, `HowToSection` s dvomi krokmi, text `Gul&aacute;&scaron;` sa dekóduje (doplň entity `&aacute; &scaron;` do `decodeEntities`, prípadne použi úplnú tabuľku HTML5 entít z knižnice `entities`).
  - `no-jsonld.html`: `findRecipeJsonLd` vráti `null`, `findOgImage` vráti URL z `<meta property="og:image">`.
  - `htmlToText`: `<p>A&amp;B</p><script>x()</script><ul><li>1</li><li>2</li></ul>` → `'A&B\n1\n2'`.
  - `jsonLdToText` zo simple fixture obsahuje riadky `Porcie: 4 porcie`, `- ` + prvá surovina a `1. ` + prvý krok.
- [ ] **Step 2: Spusti testy a over, že padajú.** `npm test -w server -- jsonld html-text`. Očakávanie: FAIL.
- [ ] **Step 3: Implementuj `html-text.ts` a `jsonld.ts`** (regex parsovanie stačí, bez DOM knižnice).
- [ ] **Step 4: Spusti testy.** `npm test -w server`. Očakávanie: PASS.
- [ ] **Step 5: Commit.** `git add server && git commit -m "feat(server): JSON-LD recipe and page text extraction"`

---

### Task 6: Server – Claude extraktor a orchestrácia importu

**Files:**
- Create: `server/src/prompt.ts`, `server/src/ai.ts`, `server/src/fetch-page.ts`, `server/src/extract.ts`, `server/scripts/smoke.ts`
- Modify: `server/src/index.ts` (zapojiť skutočný `extract`)
- Test: `server/test/extract.test.ts`

**Interfaces:**
- Consumes: `ExtractedRecipeSchema`, `ExtractRequest`, `ExtractResponse`, `ExtractErrorCode` (Task 1), `Extractor`, `ExtractResult` (Task 4), `findRecipeJsonLd`, `jsonLdToText`, `findOgImage`, `htmlToText` (Task 5)
- Produces:
  - `type AiInput = { kind: 'images'; images: { mediaType: string; data: string }[] } | { kind: 'text'; text: string }`
  - `interface RecipeAI { extract(input: AiInput, categories: string[]): Promise<{ ok: true; recipe: ExtractedRecipe } | { ok: false; error: 'not_a_recipe'|'ai_failed' }> }`
  - `createClaudeAI(apiKey: string): RecipeAI`
  - `fetchPage(url: string): Promise<{ ok: true; html: string } | { ok: false }>`: timeout 15 s, hlavička `User-Agent: Mozilla/5.0 (compatible; ReceptyApp/1.0)`, `ok:false` pri sieťovej chybe, pri statuse mimo 2xx alebo pri `content-type`, ktorý nie je `text/html`
  - `extract(req: ExtractRequest, deps: { ai: RecipeAI; fetchPage: typeof fetchPage }): Promise<ExtractResult>`

`createClaudeAI` používa `client.messages.parse` s `model: 'claude-opus-5-5'`, `max_tokens: 16000`, `output_config: { effort: 'low', format: zodOutputFormat(AiRecipeSchema) }`, kde `AiRecipeSchema = ExtractedRecipeSchema.extend({ isRecipe: z.boolean() })`. Obrázky idú ako `image` bloky (base64) v poradí, za nimi textový blok s inštrukciou. Kategórie sa posielajú v texte používateľskej správy, nie v system prompte. `stop_reason === 'refusal'`, chýbajúce `parsed_output` alebo výnimka SDK → `ai_failed`. `isRecipe === false` → `not_a_recipe`. Server-side refusal fallback (beta `fallbacks`) sa zámerne nepoužíva: pri receptoch je odmietnutie nepravdepodobné a kombinácia s `messages.parse` nie je zdokumentovaná.

`SYSTEM_PROMPT` (presné znenie):
```
You extract a single cooking recipe from the user's content (screenshots, text, or a recipe page) into the given JSON schema.
Rules:
- Keep the recipe's original language. Do not translate.
- Never invent anything. If a value is not in the source, use null (or an empty list).
- Split every ingredient line into amount (a number; convert fractions like "1/2" or "½" to 0.5), amountMax (only for ranges like "2-3"), unit, name and note.
- unit must be one of the allowed codes. Map Slovak/Czech/English units: "polievková lyžica"/"lžíce"/"tbsp" → PL, "čajová lyžička"/"lžička"/"tsp" → CL, "kávová lyžička" → KL, "kus"/"ks"/"pcs" → ks, "dkg" → convert to g (×10). If the unit is not in the list, set unit to null and put the original unit text into note.
- Ingredients without an amount (e.g. "soľ podľa chuti") have amount null and unit null; keep "podľa chuti" in note.
- Keep ingredient groups if the recipe has them (e.g. "Na cesto", "Na plnku"); otherwise use one group with name null.
- steps: one array item per step, without numbering.
- servings: an integer number of portions, or null.
- categoryNames: choose zero or more from the provided category list only, exact spelling.
- If the content is not a recipe, set isRecipe to false and fill the remaining fields with empty values.
```

Orchestrácia `extract`:
- `images` → `ai.extract({kind:'images'})`, `photoUrl: null`
- `text` → `ai.extract({kind:'text'})`, `photoUrl: null`
- `url` → `fetchPage`. Pri zlyhaní → `url_unreadable`. Ak `findRecipeJsonLd` niečo nájde → `ai.extract({kind:'text', text: jsonLdToText(r)})`, `photoUrl = r.imageUrl ?? findOgImage(html)`. Inak `htmlToText(html)`. Ak má text menej ako 200 znakov → `url_unreadable`, inak `ai.extract({kind:'text'})`, `photoUrl = findOgImage(html)`.
- `not_a_recipe` pri URL bez JSON-LD → vráti `url_unreadable`. Aplikácia potom odporučí screenshot (spec: odkazy zo sociálnych sietí).

- [ ] **Step 1: Napíš padajúce testy** v `extract.test.ts` s fake `RecipeAI` (zaznamenáva vstupy) a fake `fetchPage`:
  - text → AI dostane `{kind:'text', text}` a kategórie, výsledok `{ok:true, data:{recipe, photoUrl:null}}`
  - url s fixture `jsonld-simple.html` → AI dostane text začínajúci `Názov: `, `photoUrl` = URL obrázka z JSON-LD
  - url s `no-jsonld.html` (dosť textu) → AI dostane `htmlToText`, `photoUrl` = og:image
  - url, `fetchPage` vráti `{ok:false}` → `{ok:false, error:'url_unreadable'}`
  - url bez JSON-LD, AI vráti `not_a_recipe` → `url_unreadable`
  - text, AI vráti `not_a_recipe` → `not_a_recipe`
- [ ] **Step 2: Spusti testy a over, že padajú.** `npm test -w server -- extract`. Očakávanie: FAIL.
- [ ] **Step 3: Implementuj `prompt.ts`, `ai.ts`, `fetch-page.ts`, `extract.ts`** a zapoj `extract` v `index.ts` (`createClaudeAI(env.ANTHROPIC_API_KEY)`, `fetchPage`).
- [ ] **Step 4: Spusti testy.** `npm test -w server`. Očakávanie: PASS.
- [ ] **Step 5: Napíš `scripts/smoke.ts`**: zavolá `createClaudeAI(process.env.ANTHROPIC_API_KEY)` s krátkym slovenským receptom (6 surovín vrátane „½ lyžičky soli“, „2-3 strúčiky cesnaku“, „soľ podľa chuti“) a vypíše JSON. Spúšťa sa `npx tsx scripts/smoke.ts`. **Volanie je platené (rádovo cent). Pred spustením sa opýtaj používateľa.** Over v JSON: `amount: 0.5, unit: 'CL'`, `amount: 2, amountMax: 3, unit: 'strucik'`, soľ s `amount: null`.
- [ ] **Step 6: Commit.** `git add server && git commit -m "feat(server): Claude extractor and import orchestration"`

---

### Task 7: Server – nasadenie

**Files:**
- Modify: `server/wrangler.toml` (id KV namespace), `server/package.json` (skript `deploy`)
- Create: `server/README.md` (ako nasadiť a vymeniť kľúč/token)

Predpoklad: K1, K2.

- [ ] **Step 1: Vytvor KV namespace.** Príkaz: `npx wrangler kv namespace create LIMITS` (v `server/`). Id zapíš do `wrangler.toml`.
- [ ] **Step 2: Nastav secrets (robí vývojár, hodnoty nepíšeme do chatu ani do repa).** `npx wrangler secret put ANTHROPIC_API_KEY` a `npx wrangler secret put APP_TOKEN`. Ako token použi náhodný reťazec, napr. z `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`.
- [ ] **Step 3: Nasaď.** `npm run deploy -w server`. Očakávanie: výpis URL `https://recepty-extract.<účet>.workers.dev`.
- [ ] **Step 4: Over nasadenie** (bez platenia): `curl -s -X POST <URL>/extract` → `{"error":"unauthorized"}` so statusom 401. S tokenom a telom `{"kind":"text","text":"","categories":[]}` → `{"error":"bad_request"}`. Jedno platené overenie s krátkym receptom urob iba so súhlasom používateľa.
- [ ] **Step 5: Commit.** `git add server && git commit -m "chore(server): deployment config"`

---

### Task 8: App – kostra Expo a development build

**Files:**
- Create: `app/` cez `npx create-expo-app@latest app --template default` (z koreňa repa). Potom odstráň ukážkové obrazovky a doplň: `app/app.json`, `app/eas.json`, `app/.env.example`, `app/jest.config.js`, `app/metro.config.js` (iba ak to Expo pre monorepo vyžaduje, inak nevytváraj), `app/app/_layout.tsx`, `app/app/index.tsx` (dočasne text „Recepty“)
- Test: `app/test/smoke.test.tsx`

**Interfaces:**
- Produces: spustiteľná appka s expo-router, závislosť `@recipes/core` funguje v Metro aj v jeste

Predpoklad: K3, K4.

- [ ] **Step 1: Vytvor projekt a nastav ho.** `app.json`: `name: "Recepty"`, `slug: "recepty"`, `android.package: "sk.recepty.mama"`, `ios.bundleIdentifier: "sk.recepty.mama"`, `scheme: "recepty"`. Doinštaluj cez `npx expo install`: `expo-sqlite expo-file-system expo-image-picker expo-image-manipulator expo-keep-awake expo-sharing expo-document-picker expo-share-intent`. Ďalej `npm i fflate zod @recipes/core` a dev `jest-expo @testing-library/react-native better-sqlite3 @types/better-sqlite3`. Verziu `expo-share-intent` vyber podľa tabuľky kompatibility v jeho README pre nainštalovanú verziu Expo SDK. `eas.json`: profil `development` (`developmentClient: true`, `distribution: internal`, `android.buildType: apk`) a `preview` (`distribution: internal`, `android.buildType: apk`). `.env.example` obsahuje `EXPO_PUBLIC_EXTRACT_URL=` a `EXPO_PUBLIC_APP_TOKEN=`.
- [ ] **Step 2: Napíš smoke test**: render `app/app/index.tsx` zobrazí text „Recepty“ a test importuje `formatAmount` z `@recipes/core` (`formatAmount(0.5, 'PL') === '½'`), čím overí rozlíšenie workspace balíka v jeste.
- [ ] **Step 3: Spusti test.** `npm test -w app`. Očakávanie: PASS. Ak jest nevie importovať `@recipes/core`, doplň `transformIgnorePatterns` v `jest.config.js`.
- [ ] **Step 4: Over projekt.** `npx expo-doctor` v `app/`. Očakávanie: bez chýb (varovania k monorepu, ktoré nič nerozbíjajú, zapíš do commit správy).
- [ ] **Step 5: Zostav development build.** `npx eas build --profile development --platform android` (beží v cloude, ~15 min). Nainštaluj APK do testovacieho telefónu, spusti `npx expo start --dev-client` a over, že sa zobrazí „Recepty“.
- [ ] **Step 6: Commit.** `git add app .gitignore package.json package-lock.json && git commit -m "feat(app): Expo skeleton with dev build"`

---

### Task 9: App – databáza a repozitáre

**Files:**
- Create: `app/src/db/sql.ts`, `app/src/db/expo-db.ts`, `app/src/db/migrations.ts`, `app/src/db/recipes-repo.ts`, `app/src/db/categories-repo.ts`, `app/src/db/settings-repo.ts`, `app/src/db/context.tsx`
- Test: `app/test/sqlite-node.ts` (adaptér `SqlDb` nad better-sqlite3 pre testy), `app/test/db.test.ts`

**Interfaces:**
- Consumes: `Recipe`, `RecipeInput`, `Category`, `DEFAULT_CATEGORIES`, `normalizeText` (core)
- Produces:
  - `interface SqlDb { run(sql: string, params?: unknown[]): Promise<void>; all<T>(sql: string, params?: unknown[]): Promise<T[]>; get<T>(sql: string, params?: unknown[]): Promise<T|null>; transaction(fn: () => Promise<void>): Promise<void> }`
  - `openExpoDb(): Promise<SqlDb>` (súbor `recepty.db`, `PRAGMA foreign_keys = ON`)
  - `migrate(db: SqlDb): Promise<void>`: idempotentná. Tabuľky `recipes`, `categories`, `recipe_categories (recipe_id, category_id, PK, FK ON DELETE CASCADE)`, `settings(key PK, value)`. Pri prvom spustení vloží `DEFAULT_CATEGORIES` a nastaví `installedAt`. Zložité polia (`ingredientGroups`, `steps`, `sourceImages`) sa ukladajú ako JSON text.
  - `type RecipeListItem = { id: string; title: string; photo: string|null; categoryIds: string[] }`
  - `createRecipesRepo(db, settings): { list(): Promise<RecipeListItem[]>; get(id: string): Promise<Recipe|null>; create(input: RecipeInput): Promise<Recipe>; update(id: string, input: RecipeInput): Promise<Recipe>; remove(id: string): Promise<Recipe|null>; all(): Promise<Recipe[]>; replaceAll(recipes: Recipe[]): Promise<void>; count(): Promise<number> }`. `create`, `update` a `remove` nastavia setting `lastRecipeChangeAt`. Id generuje `crypto.randomUUID()` (v RN cez `expo-crypto`, ak globálne `crypto` chýba).
  - `createCategoriesRepo(db): { list(): Promise<Category[]>; create(name: string): Promise<Category>; rename(id: string, name: string): Promise<void>; remove(id: string): Promise<void>; replaceAll(categories: Category[]): Promise<void> }`
  - `createSettingsRepo(db): { get(key: string): Promise<string|null>; set(key: string, value: string): Promise<void> }`. Kľúče: `installedAt`, `lastBackupAt`, `lastBackupDismissedAt`, `lastRecipeChangeAt` (ISO reťazce).
  - `DbProvider` (otvorí DB, spustí `migrate`, kým nie je hotová, zobrazí prázdnu obrazovku) a `useRepos(): { recipes; categories; settings }`

- [ ] **Step 1: Napíš padajúce testy** v `db.test.ts` nad in-memory better-sqlite3:
  - po `migrate` je 7 kategórií v poradí z `DEFAULT_CATEGORIES`. Druhé `migrate` nič nepridá.
  - `create` → `get` vráti rovnaké `ingredientGroups`, `steps`, `categoryIds`, `sourceImages`
  - `update` zmení `title` aj `categoryIds` (odobratie aj pridanie)
  - `categories.remove(id)` → recept ostane, jeho `categoryIds` už to id neobsahuje
  - `recipes.remove(id)` vráti zmazaný recept (kvôli mazaniu obrázkov) a `get` potom vráti `null`
  - `create` nastaví `lastRecipeChangeAt`
  - `replaceAll` + `categories.replaceAll` v transakcii nahradí všetko (pôvodné recepty zmiznú)
- [ ] **Step 2: Spusti testy a over, že padajú.** `npm test -w app -- db`. Očakávanie: FAIL.
- [ ] **Step 3: Implementuj DB vrstvu** podľa Interfaces. `expo-db.ts` mapuje `SqlDb` na `runAsync/getAllAsync/getFirstAsync/withTransactionAsync` z `expo-sqlite`.
- [ ] **Step 4: Spusti testy.** `npm test -w app`. Očakávanie: PASS.
- [ ] **Step 5: Commit.** `git add app && git commit -m "feat(app): sqlite schema and repositories"`

---

### Task 10: App – zoznam receptov, vyhľadávanie, kategórie ako záložky

**Files:**
- Modify: `app/app/_layout.tsx` (DbProvider, Stack, nadpisy obrazoviek)
- Modify: `app/app/index.tsx`
- Create: `app/src/files/images.ts`
- Test: `app/test/list-screen.test.tsx`, `app/test/images.test.ts`

**Interfaces:**
- Consumes: `useRepos` (Task 9), `filterRecipes` (Task 3)
- Produces:
  - `saveImage(uri: string): Promise<string>`: skopíruje `file://` (`copyAsync`) alebo stiahne `http(s)` (`downloadAsync`) do `documentDirectory + 'images/<uuid>.jpg'` (adresár vytvorí, ak chýba) a vráti `'images/<uuid>.jpg'`
  - `imageUri(path: string): string` = `FileSystem.documentDirectory + path`
  - `deleteImages(paths: (string|null)[]): Promise<void>` (ignoruje null a neexistujúce súbory)
- Produces (obrazovka): `/` s vyhľadávaním (placeholder „Hľadať recept…“), vodorovnými záložkami „Všetko“ + kategórie, zoznamom (fotka 56×56 alebo sivý štvorec, názov), tlačidlom „Pridať recept“ (→ `/add`) a ikonou ozubeného kolieska v hlavičke (→ `/settings`). Prázdny stav: „Zatiaľ tu nie sú žiadne recepty. Pridaj prvý cez tlačidlo nižšie.“ Ťuknutie na recept → `/recipe/[id]`. Dáta sa načítajú pri každom zobrazení obrazovky (`useFocusEffect`).

- [ ] **Step 1: Napíš padajúce testy.** `images.test.ts` (mock `expo-file-system`): `saveImage('file:///tmp/a.jpg')` zavolá `copyAsync` a vráti reťazec zodpovedajúci `/^images\/[0-9a-f-]+\.jpg$/`. `saveImage('https://x.sk/a.jpg')` zavolá `downloadAsync`. `deleteImages([null, 'images/a.jpg'])` zmaže iba jeden súbor s `idempotent: true`. `list-screen.test.tsx`: s fake repos (3 recepty, 2 kategórie) sa zobrazia 3 názvy. Po napísaní „gulas“ do vyhľadávania ostane „Hovädzí guláš“. Po ťuknutí na záložku „Polievky“ ostanú iba polievky. Pri 0 receptoch sa zobrazí text prázdneho stavu.
- [ ] **Step 2: Spusti testy a over, že padajú.** `npm test -w app -- list-screen images`. Očakávanie: FAIL.
- [ ] **Step 3: Implementuj `images.ts` a obrazovku.** `useRepos` sa v teste podstrčí cez `DbContext.Provider` s fake hodnotou.
- [ ] **Step 4: Spusti testy.** `npm test -w app`. Očakávanie: PASS.
- [ ] **Step 5: Commit.** `git add app && git commit -m "feat(app): recipe list with search and category tabs"`

---

### Task 11: App – detail receptu s prepočtom porcií

**Files:**
- Create: `app/app/recipe/[id].tsx`
- Test: `app/test/detail-screen.test.tsx`

**Interfaces:**
- Consumes: `useRepos`, `formatIngredient` (Task 2), `imageUri`, `deleteImages` (Task 10)
- Produces: detail podľa náčrtu v spec. Fotka (ak je), názov, kategórie, čas (`totalMinutes`, inak `prep + cook`, formát „1 h 30 min“ / „45 min“). „Porcie:“ s tlačidlami − / + (min. 1, krok 1) **iba ak `servings` nie je null**. Pod tým skupiny surovín (názov skupiny ako podnadpis), očíslovaný postup, poznámky, sekcia „Originál“ s náhľadmi `sourceImages` (ťuknutie otvorí obrázok na celú obrazovku) a odkaz na `sourceUrl` (otvorí sa cez `Linking.openURL`). V hlavičke „Upraviť“ (→ `/recipe/[id]/edit`) a „Zmazať“ s potvrdením „Zmazať recept „{title}“?“ (tlačidlá „Zrušiť“ / „Zmazať“). Zmazanie zavolá `recipes.remove`, `deleteImages([photo, ...sourceImages])` a návrat na zoznam. Na obrazovke beží `useKeepAwake()`.

- [ ] **Step 1: Napíš padajúci test**: recept so `servings: 4` a surovinou 800 g → zobrazí sa „800 g“. Po dvoch ťuknutiach na „+“ sa zobrazí „6“ a „1200 g“. Recept so `servings: null` nemá tlačidlo „+“ a surovina `soľ (podľa chuti)` sa zobrazí bez čísla. Názov skupiny „Na cesto“ je viditeľný.
- [ ] **Step 2: Spusti test a over, že padá.** `npm test -w app -- detail-screen`. Očakávanie: FAIL.
- [ ] **Step 3: Implementuj obrazovku.**
- [ ] **Step 4: Spusti testy.** `npm test -w app`. Očakávanie: PASS.
- [ ] **Step 5: Commit.** `git add app && git commit -m "feat(app): recipe detail with portion scaling and keep-awake"`

---

### Task 12: App – formulár receptu a ukladanie obrázkov

**Files:**
- Create: `app/src/recipe/draft.ts`, `app/src/recipe/save.ts`, `app/src/ui/RecipeForm.tsx`, `app/src/ui/IngredientsEditor.tsx`, `app/src/ui/StepsEditor.tsx`, `app/src/ui/CategoryChips.tsx`, `app/app/new.tsx`, `app/app/recipe/[id]/edit.tsx`, `app/src/import/pending.ts`
- Test: `app/test/draft.test.ts`, `app/test/save.test.ts`, `app/test/recipe-form.test.tsx`

**Interfaces:**
- Consumes: `ExtractResponse`, `mapCategoryNames`, `Recipe`, `RecipeInput`, `Category` (core), repos (Task 9), `saveImage`, `imageUri`, `deleteImages` (Task 10)
- Produces:
  - `type ImageRef = { kind: 'stored'; path: string } | { kind: 'local'; uri: string } | { kind: 'remote'; url: string }`
  - `type RecipeDraft = Omit<RecipeInput, 'photo'|'sourceImages'> & { photo: ImageRef|null; sourceImages: ImageRef[] }`
  - `emptyDraft(): RecipeDraft` (jedna skupina `{name: null, items: []}`, prázdne kroky)
  - `extractedToDraft(res: ExtractResponse, categories: Category[], source: { kind: 'images'; uris: string[] } | { kind: 'text'; text: string } | { kind: 'url'; url: string }): RecipeDraft`: `categoryIds` cez `mapCategoryNames`, `photo` = `remote` z `photoUrl`, `sourceImages` = `local` z `uris`, `sourceText`/`sourceUrl` podľa zdroja
  - `recipeToDraft(r: Recipe): RecipeDraft`
  - `saveDraft(draft: RecipeDraft, existingId: string|null, deps: { recipes; saveImage; deleteImages }): Promise<Recipe>`: `local`/`remote` → `saveImage`, `stored` ponechá. Pri úprave zmaže uložené obrázky, ktoré v drafte už nie sú. Ak stiahnutie `remote` fotky zlyhá, uloží recept bez fotky.
  - `validateDraft(d: RecipeDraft): string|null`: chyba „Recept musí mať názov.“, ak je `title.trim()` prázdny, inak `null`
  - `pending.ts`: `setPendingImport(p: PendingImport)`, `takePendingImport(): PendingImport|null`, `setDraft(d: RecipeDraft)`, `takeDraft(): RecipeDraft|null` (modulový stav v pamäti). `type PendingImport = { kind: 'images'; uris: string[] } | { kind: 'text'; text: string } | { kind: 'url'; url: string }`
  - `RecipeForm` props: `{ initial: RecipeDraft; categories: Category[]; onSave(d: RecipeDraft): Promise<void>; originals?: ImageRef[] }`. Polia: Názov, Porcie, Čas prípravy / varenia / celkový (min), Kategórie (čipy, viac naraz), Suroviny (skupiny s voliteľným názvom; riadok: množstvo, do, jednotka (výber z `UNITS` + „—“), názov, poznámka; pridať/zmazať riadok aj skupinu), Postup (pridať/zmazať/presunúť krok), Poznámky, Fotka (Vybrať z galérie / Odstrániť). Ak sú `originals`, nad formulárom je pás náhľadov na porovnanie. Tlačidlo „Uložiť“. Množstvá sa zadávajú s desatinnou čiarkou aj bodkou.
  - `/new`: `takeDraft() ?? emptyDraft()`, `originals` = `sourceImages` draftu (pri importe z obrázkov), po uložení `router.replace('/recipe/' + id)`. `/recipe/[id]/edit`: `recipeToDraft`, po uložení späť.

- [ ] **Step 1: Napíš padajúce testy**
  - `draft.test.ts`: `extractedToDraft` s `categoryNames: ['Polievky', 'Neznáma']` → jedno `categoryId`. `photoUrl` → `{kind:'remote'}`. Zdroj `images` s 2 uri → 2× `{kind:'local'}`. Zdroj `url` → `sourceUrl`.
  - `save.test.ts` (fake `saveImage`, `deleteImages`, in-memory repos): nový draft s `local` + `remote` → v DB sú iba relatívne cesty `images/…`. `remote`, ktorého stiahnutie zlyhá → `photo: null` a recept sa uloží. Úprava, ktorá odstráni fotku → `deleteImages` dostane starú cestu.
  - `recipe-form.test.tsx`: prázdny názov + „Uložiť“ → zobrazí sa „Recept musí mať názov.“ a `onSave` sa nezavolá. Zadanie „1,5“ do množstva → `onSave` dostane `amount: 1.5`.
- [ ] **Step 2: Spusti testy a over, že padajú.** `npm test -w app -- draft save recipe-form`. Očakávanie: FAIL.
- [ ] **Step 3: Implementuj moduly a obrazovky** podľa Interfaces.
- [ ] **Step 4: Spusti testy.** `npm test -w app`. Očakávanie: PASS.
- [ ] **Step 5: Ručne na telefóne:** vytvor recept ručne, uprav ho, pridaj a odstráň fotku a zmaž ho.
- [ ] **Step 6: Commit.** `git add app && git commit -m "feat(app): recipe form, drafts and image storage"`

---

### Task 13: App – import (pridanie, načítavanie, chyby)

**Files:**
- Create: `app/app/add.tsx`, `app/app/import.tsx`, `app/src/import/prepare-images.ts`, `app/src/import/extract-client.ts`, `app/src/import/messages.ts`
- Test: `app/test/extract-client.test.ts`, `app/test/import-screen.test.tsx`

**Interfaces:**
- Consumes: `ExtractRequest`, `ExtractResponse`, `ExtractErrorCode`, `planImageTiles` (core), `setPendingImport`, `takePendingImport`, `setDraft`, `extractedToDraft` (Task 12)
- Produces:
  - `prepareImages(uris: string[]): Promise<{ mediaType: 'image/jpeg'; data: string }[]>`: pre každý obrázok `planImageTiles`, každú dlaždicu orež cez `expo-image-manipulator`, zmenši tak, aby dlhšia strana bola ≤ 1568 px, JPEG s kompresiou 0,8 a base64. Pri `image_too_long` hodí chybu, ktorú `import.tsx` zobrazí ako „Obrázok je príliš dlhý. Rozdeľ ho na viac screenshotov.“
  - `type ClientErrorCode = ExtractErrorCode | 'network' | 'timeout' | 'image_too_long'`
  - `extractRecipe(req: ExtractRequest, opts?: { fetchFn?: typeof fetch; timeoutMs?: number; baseUrl?: string; token?: string }): Promise<{ ok: true; data: ExtractResponse } | { ok: false; error: ClientErrorCode }>`: predvolene `timeoutMs` 90000, URL a token z `EXPO_PUBLIC_*`. Pri AbortError → `timeout`, pri inej výnimke fetch → `network`. Pri non-2xx prečíta `{error}`, a ak je neznámy → `ai_failed`.
  - `errorMessage(code: ClientErrorCode): string` (presné texty):
    - `network`: „Nepodarilo sa spojiť so serverom. Skontroluj pripojenie na internet a skús znova.“
    - `timeout`: „Čítanie receptu trvá príliš dlho. Skús to znova.“
    - `not_a_recipe`: „V tomto obsahu sa nenašiel žiadny recept.“
    - `url_unreadable`: „Z tohto odkazu sa recept nedá načítať. Skús radšej poslať screenshot.“
    - `rate_limited`: „Dnes sa už načítalo veľa receptov. Skús to zajtra alebo recept vyplň ručne.“
    - `image_too_long`: „Obrázok je príliš dlhý. Rozdeľ ho na viac screenshotov.“
    - ostatné: „Recept sa nepodarilo prečítať. Skús to znova alebo ho vyplň ručne.“
  - `/add`: tri veľké voľby: „Obrázok alebo screenshot“ (ponuka „Z galérie“ s viacnásobným výberom / „Odfotiť“), „Vložiť text“ (viacriadkové pole + „Načítať“), „Vložiť odkaz“ (pole + „Načítať“; ak schránka obsahuje URL, predvyplní ju). Štvrtá, menej výrazná voľba: „Vyplniť ručne“ → `/new`. Každá voľba zavolá `setPendingImport` a `router.push('/import')`.
  - `/import`: `takePendingImport()` (ak je null, návrat späť), text „Čítam recept…“ so spinnerom. Pri úspechu `setDraft(extractedToDraft(...))` a `router.replace('/new')`. Pri chybe `errorMessage` a tlačidlá „Skúsiť znova“ (rovnaký vstup) a „Vyplniť ručne“ (→ `/new` s prázdnym draftom; pri obrázkoch s nimi ako `sourceImages`, aby mama mohla prepisovať).

- [ ] **Step 1: Napíš padajúce testy**
  - `extract-client.test.ts` (fake `fetchFn`): 200 → `{ok:true, data}`. 422 `{error:'not_a_recipe'}` → `not_a_recipe`. 500 s HTML telom → `ai_failed`. `fetchFn` hodí `TypeError` → `network`. Pomalý `fetchFn` s `timeoutMs: 10` → `timeout`. Hlavička `Authorization: Bearer <token>` je odoslaná. `errorMessage('url_unreadable')` sa rovná presnému textu vyššie.
  - `import-screen.test.tsx`: s mockom `extractRecipe` → `rate_limited` sa zobrazí text pre `rate_limited` a obe tlačidlá. Pri úspechu sa zavolá `router.replace('/new')`.
- [ ] **Step 2: Spusti testy a over, že padajú.** `npm test -w app -- extract-client import-screen`. Očakávanie: FAIL.
- [ ] **Step 3: Implementuj moduly a obrazovky.**
- [ ] **Step 4: Spusti testy.** `npm test -w app`. Očakávanie: PASS.
- [ ] **Step 5: Ručne na telefóne s nasadeným serverom (každý import je platený, rádovo centy; poraď sa s používateľom o počte pokusov):** screenshot receptu z webu, dva screenshoty jedného receptu, dlhý „scroll“ screenshot, vložený text, odkaz na recept s JSON-LD (napr. veľký slovenský receptový web), odkaz na Facebook príspevok → hláška `url_unreadable`. Zapíš, čo AI rozpoznala zle, ako podklad na úpravu promptu.
- [ ] **Step 6: Commit.** `git add app && git commit -m "feat(app): import from images, text and url"`

---

### Task 14: App – príjem zo „Zdieľať“

**Files:**
- Modify: `app/app.json` (plugin `expo-share-intent`: `androidIntentFilters: ["text/*", "image/*"]`, `androidMultiIntentFilters: ["image/*"]`; iOS voľby podľa README pluginu, aby iOS build v druhej fáze fungoval)
- Modify: `app/app/_layout.tsx`
- Create: `app/src/import/share-intent.ts`
- Test: `app/test/share-intent.test.ts`

**Interfaces:**
- Consumes: `classifySharedText` (core), `setPendingImport` (Task 12)
- Produces: `shareToPending(intent: { files?: { path: string; mimeType: string }[] | null; text?: string | null; webUrl?: string | null }): PendingImport | null`. Obrázkové súbory → `images`. Inak `webUrl` → `url`. Inak `text` → `classifySharedText`. Inak `null`. V `_layout.tsx`: `useShareIntent()`. Keď `hasShareIntent`, zavolá `shareToPending`, `setPendingImport`, `router.push('/import')` a `resetShareIntent()`.

- [ ] **Step 1: Napíš padajúci test** pre `shareToPending`: 2 obrázky → `{kind:'images', uris:[2]}`. `webUrl` → `url`. Text „Názov\nhttps://x.sk/r“ → `url`. Dlhý text → `text`. Súbor `application/pdf` bez textu → `null`.
- [ ] **Step 2: Spusti test a over, že padá.** `npm test -w app -- share-intent`. Očakávanie: FAIL.
- [ ] **Step 3: Implementuj `share-intent.ts` a zapoj hook** v `_layout.tsx`.
- [ ] **Step 4: Spusti testy.** `npm test -w app`. Očakávanie: PASS.
- [ ] **Step 5: Zostav nový development build** (zmena natívnej konfigurácie): `npx eas build --profile development --platform android`. Na telefóne over: screenshot → Zdieľať → Recepty otvorí „Čítam recept…“. Zdieľanie stránky z Chromu → import z odkazu. Zdieľanie dvoch obrázkov z galérie → jeden recept s dvomi originálmi. Zdieľanie, keď je appka zatvorená aj otvorená.
- [ ] **Step 6: Commit.** `git add app && git commit -m "feat(app): receive shared images, text and links"`

---

### Task 15: App – správa kategórií

**Files:**
- Create: `app/app/categories.tsx`
- Modify: `app/app/settings.tsx` (odkaz „Kategórie“; súbor vznikne tu, ak ešte neexistuje), `app/app/index.tsx` (posledná záložka „Upraviť“ → `/categories`)
- Test: `app/test/categories-screen.test.tsx`

**Interfaces:**
- Consumes: `categories` repo (Task 9)
- Produces: zoznam kategórií. Pri každej „Premenovať“ (modál s `TextInput`, nie `Alert.prompt`) a „Zmazať“ s potvrdením „Zmazať kategóriu „{name}“? Recepty v nej ostanú.“ Dole „Pridať kategóriu“. Prázdny alebo duplicitný názov (porovnaný cez `normalizeText`) sa neuloží a zobrazí sa „Kategória s týmto názvom už existuje.“ alebo „Zadaj názov kategórie.“

- [ ] **Step 1: Napíš padajúci test**: pridanie „Raňajky“ → zobrazí sa v zozname. Pridanie „polievky“ pri existujúcich „Polievkach“ → chybový text. Premenovanie zavolá `rename`.
- [ ] **Step 2: Spusti test a over, že padá.** `npm test -w app -- categories-screen`. Očakávanie: FAIL.
- [ ] **Step 3: Implementuj obrazovku.**
- [ ] **Step 4: Spusti testy.** `npm test -w app`. Očakávanie: PASS.
- [ ] **Step 5: Commit.** `git add app && git commit -m "feat(app): manage categories"`

---

### Task 16: App – záloha, obnova a pripomienka

**Files:**
- Create: `app/src/backup/format.ts`, `app/src/backup/zip.ts`, `app/src/backup/actions.ts`, `app/src/ui/BackupBanner.tsx`
- Modify: `app/app/settings.tsx`, `app/app/index.tsx` (banner nad zoznamom)
- Test: `app/test/backup.test.ts`

**Interfaces:**
- Consumes: repos (Task 9), `imageUri` (Task 12), `shouldRemindBackup` (Task 3)
- Produces:
  - `type BackupFile = { format: 'recepty-backup'; version: 1; exportedAt: string; categories: Category[]; recipes: Recipe[] }`
  - `buildBackupJson(categories: Category[], recipes: Recipe[], now: Date): BackupFile`
  - `parseBackupJson(text: string): BackupFile`: zod validácia, pri chybe hodí `BackupFormatError` so správou „Súbor nie je záloha receptov.“
  - `createBackupZip(file: BackupFile, readImage: (path: string) => Promise<Uint8Array|null>): Promise<Uint8Array>`: `backup.json` + každá cesta z `photo` a `sourceImages` pod rovnakou relatívnou cestou (`images/…`). Chýbajúci obrázok sa preskočí.
  - `readBackupZip(zip: Uint8Array): { file: BackupFile; images: Map<string, Uint8Array> }`
  - `exportBackup(repos): Promise<void>`: zapíše `cacheDirectory + 'recepty-zaloha-YYYY-MM-DD.zip'`, otvorí `Sharing.shareAsync` a po návrate nastaví `lastBackupAt`
  - `restoreBackup(repos): Promise<'restored'|'cancelled'>`: `DocumentPicker` (zip), `readBackupZip`, potvrdenie „Obnoviť zálohu? Aktuálne recepty ({n}) sa nahradia receptami zo zálohy ({m}).“ Potom zmaže adresár `images/`, zapíše obrázky a v jednej transakcii `categories.replaceAll` + `recipes.replaceAll`.
  - `/settings`: „Zálohovať recepty“, „Obnoviť zo zálohy“, text „Posledná záloha: {d. M. yyyy}“ alebo „Zatiaľ žiadna záloha“, odkaz „Kategórie“
  - `BackupBanner`: zobrazí sa, keď `shouldRemindBackup(...)` vráti true. Text „Recepty sú zatiaľ iba v tomto telefóne. Zálohuj si ich.“ s tlačidlami „Zálohovať“ (→ `exportBackup`) a „Neskôr“ (nastaví `lastBackupDismissedAt`).

- [ ] **Step 1: Napíš padajúce testy** v `backup.test.ts`: `buildBackupJson` → `createBackupZip` (fake `readImage` vráti bajty pre `images/a.jpg`) → `readBackupZip` vráti rovnaké recepty, kategórie aj bajty obrázka pod kľúčom `images/a.jpg`. Žiadna cesta v `backup.json` nezačína `/` ani `file:`. Chýbajúci obrázok nezhodí export. `parseBackupJson('{}')` hodí `BackupFormatError`.
- [ ] **Step 2: Spusti testy a over, že padajú.** `npm test -w app -- backup`. Očakávanie: FAIL.
- [ ] **Step 3: Implementuj zálohu, obnovu, nastavenia a banner.** fflate: `zipSync`/`unzipSync`. Prevod base64 ↔ `Uint8Array` pri čítaní a zápise cez `expo-file-system`.
- [ ] **Step 4: Spusti testy.** `npm test -w app`. Očakávanie: PASS.
- [ ] **Step 5: Ručne na telefóne:** export na Google Drive. Odinštaluj a znova nainštaluj appku, obnov zo zálohy a over, že recepty aj obrázky sú späť.
- [ ] **Step 6: Commit.** `git add app && git commit -m "feat(app): backup export, restore and reminder"`

---

### Task 17: Release APK a test na maminom telefóne

**Files:**
- Modify: `app/app.json` (ikona a názov „Recepty“, `version` 1.0.0)
- Create: `docs/install.md` (ako nainštalovať a aktualizovať APK u mamy, ako vymeniť `APP_TOKEN`)

- [ ] **Step 1: Over celý balík.** `npm test` (koreň). Očakávanie: všetky workspace testy PASS.
- [ ] **Step 2: Zostav preview APK.** `npx eas build --profile preview --platform android`. Premenné `EXPO_PUBLIC_*` musia byť dostupné pri builde: nastav ich cez `eas env:create` pre prostredie `preview` (robí vývojár).
- [ ] **Step 3: Nainštaluj APK na mamin telefón (K4)** a prejdi s ňou kontrolný zoznam: zdieľanie screenshotu, zdieľanie odkazu z prehliadača, oprava receptu vo formulári, vyhľadanie podľa názvu, filter podľa kategórie, prepočet porcií, obrazovka nezhasína v detaile, export zálohy.
- [ ] **Step 4: Commit.** `git add app docs && git commit -m "chore: release 1.0.0 for Android"`

---

## Druhá fáza (mimo tohto plánu)

iOS: Apple Developer účet, iOS konfigurácia `expo-share-intent` (App Group), `eas build --platform ios`, TestFlight. Kód z tohto plánu sa nemení, pribudne konfigurácia a test na iPhone.
