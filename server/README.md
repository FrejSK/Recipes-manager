# Server (Cloudflare Worker `recepty-extract`)

Malý server, ktorý aplikácii extrahuje recepty cez Claude API. Beží ako
Cloudflare Worker (pre Java vývojára: niečo ako serverless funkcia, ktorú
nahráš príkazom a Cloudflare ju prevádzkuje). Všetky príkazy sa spúšťajú
z priečinka `server/`.

Node.js nie je v PATH, preto v PowerShelli najprv:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd server
```

## Predpoklady

- Node.js (inštalácia je popísaná v `INSTALLED.md` v koreni repozitára).
- Bezplatný účet na Cloudflare (https://dash.cloudflare.com/sign-up).
- API kľúč od Anthropic (https://console.anthropic.com) s nastaveným
  mesačným limitom výdavkov, odporúčame 5 $.
- Závislosti nainštalované: `npm install` v koreni repozitára.

## Prvé nasadenie

1. Prihlásenie do Cloudflare (otvorí prehliadač):

   ```powershell
   npx wrangler login
   ```

   Pozor: prihlasovacia konfigurácia sa uloží do profilu používateľa, na
   Windows do `%USERPROFILE%\.wrangler` a/alebo `%APPDATA%\xdg.config\.wrangler`.
   Tieto priečinky si zapíš do `INSTALLED.md` (riadky tam už sú pripravené).

2. Vytvorenie KV úložiska pre denné limity:

   ```powershell
   npx wrangler kv namespace create LIMITS
   ```

   Vo výpise nájdi `id = "..."` a vlož ho v `wrangler.toml` namiesto
   `TODO_KV_NAMESPACE_ID`.

3. Uloženie API kľúča od Anthropic ako tajomstva (príkaz si vypýta hodnotu,
   vlož ju a potvrď Enterom):

   ```powershell
   npx wrangler secret put ANTHROPIC_API_KEY
   ```

4. Vygenerovanie vlastného tokenu pre aplikáciu a jeho uloženie:

   ```powershell
   node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
   npx wrangler secret put APP_TOKEN
   ```

   Vypísanú hodnotu si ulož bokom (nikam ju necommituj): rovnaká patrí do
   `EXPO_PUBLIC_APP_TOKEN` pri zostavovaní aplikácie.

5. Nasadenie:

   ```powershell
   npm run deploy
   ```

   Na konci sa vypíše URL v tvare `https://recepty-extract.<účet>.workers.dev`.

## Overenie bez platenia

Nahraď `<URL>` svojou adresou a `<token>` tokenom z kroku 4.

Bez tokenu, očakávaš HTTP 401 a `{"error":"unauthorized"}`:

```powershell
curl.exe -s -i -X POST <URL>/extract
```

S tokenom a prázdnym vstupom, očakávaš HTTP 400 a `{"error":"bad_request"}`
(Claude sa nevolá, nič sa neplatí):

```powershell
curl.exe -s -i -X POST <URL>/extract -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{\"kind\":\"text\",\"text\":\"\",\"categories\":[]}'
```

(V PowerShelli 5.1 treba v `-d` escapovať úvodzovky ako `\"`. V Git Bashi
použi bežné `'{"kind":"text","text":"","categories":[]}'`.)

## Voliteľný platený test (smoke test)

Zavolá skutočné Claude API, stojí približne jeden cent. Spúšťaj len vedome.

Git Bash:

```bash
ANTHROPIC_API_KEY=... npx tsx scripts/smoke.ts
```

PowerShell:

```powershell
$env:ANTHROPIC_API_KEY="..."; npx tsx scripts/smoke.ts
```

(`...` nahraď svojím kľúčom, nikdy ho nezapisuj do súboru v repozitári.)

## Výmena tajomstiev

- `APP_TOKEN`: vygeneruj nový (krok 4), spusti `npx wrangler secret put APP_TOKEN`
  a potom aplikáciu znova zostav s novým `EXPO_PUBLIC_APP_TOKEN`. Kým to
  neurobíš, staré zostavenia aplikácie dostanú 401.
- `ANTHROPIC_API_KEY`: vytvor nový kľúč v konzole Anthropic a spusti
  `npx wrangler secret put ANTHROPIC_API_KEY`. Aplikáciu netreba znova
  zostavovať.

## Lokálny vývoj

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Do `.dev.vars` doplň `ANTHROPIC_API_KEY=` a `APP_TOKEN=` (súbor je mimo gitu).
Potom:

```powershell
npm run dev
```

Server beží na `http://localhost:8787`.

## Odinštalovanie a upratovanie

Najprv, kým je ešte Node nainštalovaný, zmaž Worker z Cloudflare:

```powershell
npx wrangler delete
```

Potom odstráň prihlasovacie priečinky:

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.wrangler" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:APPDATA\xdg.config\.wrangler" -ErrorAction SilentlyContinue
```

KV úložisko `LIMITS` a prípadne ďalšie veci môžeš zmazať aj v dashboarde
Cloudflare (Workers & Pages, Storage & Databases, KV).
