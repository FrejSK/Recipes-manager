# Prechod z Claude na Gemini: krátky návrh

Dátum: 2026-11-25. Schválené používateľom v konverzácii.

## Prečo

Vývojár chce na rozpoznávanie receptov používať kľúč z Google AI Studio
(Gemini) namiesto Anthropic API. Dôvodom je bezplatný plán AI Studio.

## Ciele

- Server (`server/`) volá na extrakciu receptu Gemini namiesto Claude.
- Správanie pre aplikáciu sa nemení: rovnaký endpoint `POST /extract`,
  rovnaký formát odpovede, rovnaké chybové kódy.

## Mimo rozsahu

- Prepínanie medzi Claude a Gemini (YAGNI).
- Akékoľvek zmeny v aplikácii (`app/`) alebo v `core/`.
- Zmena promptu (ostáva `server/src/prompt.ts`).

## Prístupy

| Prístup | Za | Proti |
|---|---|---|
| **Iba Gemini** *(zvolené)* | Najmenej kódu, jedna závislosť | Návrat na Claude znamená ďalšiu výmenu súboru `ai.ts` |
| Oba poskytovatelia s prepínačom | Dá sa prepnúť bez kódu | Dvojitý kód, testy aj návod pre niečo, čo sa nepoužije |

## Návrh

- `server/src/ai.ts`: `createGeminiAI(apiKey, model, client?)` implementuje
  existujúce rozhranie `RecipeAI`. Používa oficiálne SDK `@google/genai`
  (`generateContent`):
  - `systemInstruction` je `SYSTEM_PROMPT`;
  - obrázky sa posielajú ako `inlineData` (base64 + mimeType), za nimi text
    z `imagesInstruction`, pri texte `textInstruction`;
  - štruktúrovaný výstup cez `responseMimeType: 'application/json'` a JSON
    schému odvodenú zo zod schémy `AiRecipeSchema` (ExtractedRecipe +
    `isRecipe`);
  - odpoveď sa parsuje a overí cez `AiRecipeSchema.safeParse`;
  - chyby, blokovaná odpoveď alebo nevalidný JSON vedú na `ai_failed`,
    `isRecipe: false` na `not_a_recipe`;
  - logovanie ostáva ako doteraz: iba názov chyby a stav, nikdy obsah.
- `server/src/index.ts` použije `GEMINI_API_KEY` (secret) a `GEMINI_MODEL`
  (premenná vo `wrangler.toml`, predvolene `gemini-3.8-flash`), takže model
  sa dá zmeniť bez kódu.
- `@anthropic-ai/sdk` sa z `server` odstráni a pribudne `@google/genai`.
- Testy (`server/test/extract.test.ts`) používajú falošného klienta Gemini
  s rovnakými prípadmi ako doteraz: úspech, nie je recept, prázdna alebo
  zablokovaná odpoveď, nevalidný JSON, výnimka SDK, overenie, že schéma
  a obrázky sa posielajú správne.
- `server/scripts/smoke.ts`, `server/.dev.vars.example`, `server/README.md`,
  `docs/install.md` a `docs/follow-ups.md` sa prepíšu z Anthropic na Gemini.
  README pridá poznámku, že pri bezplatnom pláne môže Google použiť obsah
  na zlepšovanie svojich služieb.

## Doplnok (2026-11-25): preťaženie Gemini

Pri prvých skutočných importoch Gemini vrátil `503` a `504` (preťažený model
`gemini-3.8-flash` na bezplatnom pláne). Vývojár schválil dve zmeny:

1. **Primárny model `gemini-3.6-flash`** (`GEMINI_MODEL` vo `wrangler.toml`).
2. **Automatické opakovanie a záložný model:**
   - opakuje sa iba pri dočasných chybách API: stav 429, 500, 502, 503, 504;
   - poradie pokusov: primárny model, po krátkej pauze (~1 s) znova primárny,
     potom raz záložný model `GEMINI_FALLBACK_MODEL` (predvolene
     `gemini-3.8-flash`; prázdna hodnota = bez zálohy);
   - všetky pokusy spolu sa musia zmestiť do 70 s (spoločný termín). Každý pokus
     dostane ako timeout zvyšný čas a ďalší pokus sa nespustí, ak ostáva menej
     ako ~5 s;
   - neopakuje sa pri vypršaní času, chybách 400/401/403, nevalidnej odpovedi,
     nezhode so schémou ani pri „nie je recept“;
   - každý neúspešný pokus sa zaloguje (model, poradie pokusu, názov chyby,
     stav), nikdy nie obsah.

## Na staviteľovi

- Presné názvy parametrov SDK `@google/genai` (overiť v nainštalovanej
  verzii a jej typoch).
- Spôsob prevodu zod schémy na JSON schému (napr. `z.toJSONSchema` v zod 4),
  ak ju Gemini prijme. Inak upraviť schému pre Gemini.
- Overiť, že `gemini-3.8-flash` je aktuálny názov stabilného modelu Flash.
