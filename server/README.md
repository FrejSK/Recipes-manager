# Server (Cloudflare Worker `recepty-extract`)

Malý server, ktorý aplikácii extrahuje recepty cez Gemini API od Google. Beží ako
Cloudflare Worker (pre Java vývojára: niečo ako serverless funkcia, ktorú
nahráš príkazom a Cloudflare ju prevádzkuje). Všetky príkazy sa spúšťajú
z priečinka `server/`.

Node.js nie je v PATH, preto v PowerShelli najprv:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd server
```

Príkazy `npm` a `npx` píšeme ako `npm.cmd` a `npx.cmd`. PowerShell by inak
spustil skripty `npm.ps1`/`npx.ps1`, ktoré predvolené nastavenie Windows
(execution policy) blokuje; verzie `.cmd` fungujú bez zmeny nastavení.

## Predpoklady

- Node.js (inštalácia je popísaná v `INSTALLED.md` v koreni repozitára).
- Bezplatný účet na Cloudflare (https://dash.cloudflare.com/sign-up).
- API kľúč z Google AI Studio (https://aistudio.google.com/apikey). Stačí
  bezplatný plán; má denný limit požiadaviek. Pozor: pri bezplatnom pláne
  môže Google odoslaný obsah (texty, odkazy a screenshoty receptov) použiť na
  zlepšovanie svojich produktov. Ak to nechceš, zapni v AI Studio platený
  plán (billing) a nastav si limit výdavkov.
- Závislosti nainštalované: `npm.cmd install` v koreni repozitára.

## Prvé nasadenie

1. Prihlásenie do Cloudflare (otvorí prehliadač):

   ```powershell
   npx.cmd wrangler login
   ```

   Pozor: prihlasovacia konfigurácia sa uloží do profilu používateľa, na
   Windows do `%USERPROFILE%\.wrangler` a/alebo `%APPDATA%\xdg.config\.wrangler`.
   Tieto priečinky si zapíš do `INSTALLED.md` (riadky tam už sú pripravené).

2. Vytvorenie KV úložiska pre denné limity:

   ```powershell
   npx.cmd wrangler kv namespace create LIMITS
   ```

   Vo výpise nájdi `id = "..."` a vlož ho v `wrangler.toml` namiesto
   `TODO_KV_NAMESPACE_ID`.

3. Uloženie API kľúča z Google AI Studio ako tajomstva (príkaz si vypýta hodnotu,
   vlož ju a potvrď Enterom):

   ```powershell
   npx.cmd wrangler secret put GEMINI_API_KEY
   ```

4. Vygenerovanie vlastného tokenu pre aplikáciu a jeho uloženie:

   ```powershell
   node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
   npx.cmd wrangler secret put APP_TOKEN
   ```

   Vypísanú hodnotu si ulož bokom (nikam ju necommituj): rovnaká patrí do
   `EXPO_PUBLIC_APP_TOKEN` pri zostavovaní aplikácie.

5. Nasadenie:

   ```powershell
   npm.cmd run deploy
   ```

   Na konci sa vypíše URL v tvare `https://recepty-extract.<účet>.workers.dev`.

## Overenie bez platenia

Nahraď `<URL>` svojou adresou a `<token>` tokenom z kroku 4.

Bez tokenu, očakávaš HTTP 401 a `{"error":"unauthorized"}`:

```powershell
curl.exe -s -i -X POST <URL>/extract
```

S tokenom a prázdnym vstupom, očakávaš HTTP 400 a `{"error":"bad_request"}`
(Gemini sa nevolá, nič sa nemíňa):

```powershell
curl.exe -s -i -X POST <URL>/extract -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{\"kind\":\"text\",\"text\":\"\",\"categories\":[]}'
```

(V PowerShelli 5.1 treba v `-d` escapovať úvodzovky ako `\"`. V Git Bashi
použi bežné `'{"kind":"text","text":"","categories":[]}'`.)

## Voliteľný test so skutočným Gemini (smoke test)

Zavolá skutočné Gemini API. Na bezplatnom pláne sa započíta do denného
limitu, na platenom sa platí podľa spotreby. Spúšťaj len vedome.

Kľúč patrí do súboru `server/.dev.vars` (ten istý, ktorý používa
`npm.cmd run dev`, pozri Lokálny vývoj). Súbor je v `.gitignore`, takže sa
nedostane do gitu. Vytvor ho v editore (napr. Poznámkový blok alebo VS Code),
nie príkazom typu `echo`, a vlož do neho riadok `GEMINI_API_KEY=` s
tvojím kľúčom. Potom z `server/`:

```powershell
npx.cmd tsx --env-file=.dev.vars scripts/smoke.ts
```

Nikdy nevkladaj kľúče priamo do príkazu: príkazový riadok sa ukladá do
histórie (PowerShell: `%APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`,
Git Bash: `~/.bash_history`) v čistom texte.

## Sledovanie (logy a CPU)

Keď skúšaš import v aplikácii, nechaj v druhom okne PowerShellu (v `server/`)
bežať živý výpis logov Workera:

```powershell
npx.cmd wrangler tail
```

Pri chybe tam uvidíš riadok `ai_failed` alebo `extract_failed` s typom chyby,
HTTP stavom a pri AI aj `finishReason`/`blockReason` (prečo Gemini skončilo
alebo odpoveď zablokovalo) či `reason` (napr. `invalid_json`,
`missing_api_key`). Stav 429 znamená prekročený limit požiadaviek Gemini
(na bezplatnom pláne je nízky).
Obsah receptov, tokeny ani kľúče sa nelogujú. Výpis ukončíš klávesmi Ctrl+C.

V dashboarde Cloudflare (Workers & Pages, `recepty-extract`, Metrics) si
občas pozri CPU time na požiadavku. Bezplatný plán má na jednu požiadavku
nízky limit CPU času (čakanie na Gemini API sa doňho nepočíta, spracovanie
veľkej stránky áno). Ak importy zlyhávajú a v `wrangler tail` sa objavujú
chyby, ktoré spomínajú CPU alebo prekročené limity (napr. „exceeded CPU“,
„Exceeded resources“), prepni Worker na plán Workers Paid (približne 5 $
mesačne) v dashboarde v časti Workers & Pages, Plans.

## Výmena tajomstiev

- `APP_TOKEN`: vygeneruj nový (krok 4), spusti `npx.cmd wrangler secret put APP_TOKEN`
  a potom aplikáciu znova zostav s novým `EXPO_PUBLIC_APP_TOKEN`. Kým to
  neurobíš, staré zostavenia aplikácie dostanú 401.
- `GEMINI_API_KEY`: vytvor nový kľúč v Google AI Studio
  (https://aistudio.google.com/apikey), spusti
  `npx.cmd wrangler secret put GEMINI_API_KEY` a starý kľúč v AI Studio zmaž.
  Aplikáciu netreba znova zostavovať.

## Zmena modelu

Model je v `wrangler.toml` v premennej `GEMINI_MODEL` (predvolene
`gemini-3.8-flash`). Názvy modelov sú na https://ai.google.dev/gemini-api/docs/models.
Zmeň hodnotu a znova nasaď:

```powershell
npm.cmd run deploy
```

Kód ani aplikáciu netreba meniť. Pre lokálny vývoj a smoke test môžeš
pridať riadok `GEMINI_MODEL=` aj do `.dev.vars`.

## Lokálny vývoj

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Do `.dev.vars` doplň `GEMINI_API_KEY=` a `APP_TOKEN=` (súbor je mimo gitu).
Potom:

```powershell
npm.cmd run dev
```

Server beží na `http://localhost:8787`.

## Odinštalovanie a upratovanie

Najprv, kým je ešte Node nainštalovaný, zmaž Worker z Cloudflare:

```powershell
npx.cmd wrangler delete
```

Potom odstráň prihlasovacie priečinky:

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.wrangler" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:APPDATA\xdg.config\.wrangler" -ErrorAction SilentlyContinue
```

KV úložisko `LIMITS` a prípadne ďalšie veci môžeš zmazať aj v dashboarde
Cloudflare (Workers & Pages, Storage & Databases, KV).
