# Inštalácia a aktualizácia aplikácie Recepty (Android)

Návod pre Java vývojára, ktorý s Expo začína. Všetky príkazy sú pre PowerShell.
Expo/EAS je pre Android niečo ako Maven + CI server v jednom: `eas build`
zostaví APK v cloude a vráti ti odkaz na stiahnutie.

Node.js nie je v PATH, preto v každom novom okne PowerShellu najprv:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd C:\Users\mecar\Documents\Projects\Recipes-manager
```

Príkazy `eas` spúšťame cez `npx eas-cli@latest` (samotné `npx eas` nefunguje,
balík sa volá `eas-cli`). Aby si to nemusel stále písať, v relácii môžeš
použiť alias:

```powershell
function eas { npx eas-cli@latest @args }
```

Ďalej v texte píšem krátko `eas ...`.

## 1. Predpoklady

- Node.js nainštalovaný podľa `INSTALLED.md` v koreni repozitára.
- Bezplatný účet na https://expo.dev (Expo account).
- Nasadený server podľa `server/README.md` (Cloudflare Worker `recepty-extract`).
- Dve hodnoty zo servera:
  - `EXTRACT_URL`: adresa Workera bez koncového `/` a bez `/extract`
    (napr. `https://recepty-extract.x.workers.dev`),
  - `APP_TOKEN`: token, ktorý si uložil v kroku 4 v `server/README.md`.
- Závislosti: `npm install` v koreni repozitára.

Poznámka: `eas login` vytvorí priečinok `%USERPROFILE%\.expo`. Je zapísaný
v `INSTALLED.md` aj s príkazom na odstránenie.

## 2. Development build na testovací telefón

Development build je APK s vývojárskym klientom: aplikácia sa pripojí na
`expo start` na tvojom počítači a zmeny v kóde vidíš hneď. Obyčajné Expo Go
nestačí, lebo používame natívne moduly (`expo-share-intent`).

```powershell
cd app
npx eas-cli@latest login
npx eas-cli@latest init
```

`eas init` vytvorí projekt na expo.dev a zapíše `extra.eas.projectId` (a
prípadne `owner`) do `app/app.json`. Túto zmenu commitni:

```powershell
git add app.json
git commit -m "chore(app): add EAS projectId"
```

Zostavenie:

```powershell
npx eas-cli@latest build --profile development --platform android
```

Po dokončení (niekoľko minút, na bezplatnom pláne môže byť fronta) dostaneš
odkaz a QR kód. Otvor ich na telefóne, stiahni APK a nainštaluj ho (povoľ
inštaláciu z neznámych zdrojov, pozri krok 3).

Lokálne nastavenie premenných:

```powershell
Copy-Item .env.example .env
notepad .env
```

Do `.env` doplň `EXPO_PUBLIC_EXTRACT_URL` a `EXPO_PUBLIC_APP_TOKEN`
(súbor je mimo gitu). Potom:

```powershell
npx expo start --dev-client
```

Telefón musí byť v rovnakej Wi-Fi ako počítač. Otvor nainštalovanú
aplikáciu a naskenuj QR kód alebo vyber server zo zoznamu.

## 3. Release APK pre mamu

Release APK (profil `preview`) je samostatná aplikácia, nepotrebuje počítač.
Hodnoty `EXPO_PUBLIC_*` sa do nej vpečú pri zostavovaní, preto musia byť
dostupné v EAS.

### 3.1 Premenné prostredia v EAS (prostredie `preview`)

Spusti príkaz dvakrát (raz pre každú premennú). Nechaj ho, nech sa spýta na
hodnotu: **hodnotu nikdy nepíš priamo do príkazového riadka**, zostala by
v histórii PowerShellu.

```powershell
npx eas-cli@latest env:create --environment preview
```

Príkaz sa pýta interaktívne na názov (`EXPO_PUBLIC_EXTRACT_URL`, potom
`EXPO_PUBLIC_APP_TOKEN`), hodnotu a viditeľnosť. Pre `EXPO_PUBLIC_*` premenné
EAS nepovolí viditeľnosť `secret`, pretože sa tak či tak dostanú do
aplikácie; vyber `sensitive` alebo `plain text`. Presné voľby si pozri cez
`npx eas-cli@latest env:create --help` (po `eas login`). Zoznam overíš:

```powershell
npx eas-cli@latest env:list --environment preview
```

Pozor: token je v APK vždy čitateľný pre toho, kto APK rozbalí. Preto máme na
serveri denný limit a token vieme vymeniť (pozri nižšie).

### 3.2 Profil `preview` v `eas.json`

Profil `preview` v `app/eas.json` má `"environment": "preview"`, takže build
automaticky použije premenné z kroku 3.1. (Pole `environment` v profile
podporujú novšie verzie eas-cli; ak by ho tvoja verzia nepoznala, aktualizuj
cez `npx eas-cli@latest`, ktoré berie vždy najnovšiu.)

### 3.3 Zostavenie a inštalácia

```powershell
npx eas-cli@latest build --profile preview --platform android
```

1. Po dokončení otvor odkaz (alebo ho nájdeš na https://expo.dev v projekte
   `recepty` v časti Builds) a stiahni `.apk`.
2. Pošli ho mame (napr. cez Disk/e-mail) alebo ho stiahni priamo na jej
   telefóne cez odkaz/QR kód.
3. Na mamino telefóne povoľ inštaláciu z neznámych zdrojov (K4): pri otvorení
   APK Android ponúkne Nastavenia, kde povolíš inštaláciu pre aplikáciu, z
   ktorej APK otváraš (Chrome, Súbory, Disk), napr. Nastavenia, Aplikácie,
   Špeciálny prístup, Inštalovať neznáme aplikácie.
4. Nainštaluj aplikáciu Recepty a otvor ju.

Ikona aplikácie je zatiaľ šablónová z Expo. Keď dodáš vlastnú ikonu, vymeň
súbory v `app/assets/images/` (`icon.png`, `android-icon-*.png`) a zostav
nový build.

## 4. Aktualizácia aplikácie

1. V `app/app.json` zvýš `version` (napr. `1.0.1`).
2. Zostav znova: `npx eas-cli@latest build --profile preview --platform android`.
3. APK nainštaluj cez starú aplikáciu (prepíše ju, odinštalovať netreba).

Mamine recepty zostanú zachované, kým sa nezmení balík `sk.recepty.mama`
a podpisový kľúč. Kľúč spravuje EAS (uložený v projekte na expo.dev).
**Nemaž EAS projekt ani jeho credentials.** Pri novom kľúči Android odmietne
APK nainštalovať cez starú aplikáciu a dáta by sa dali zachrániť len zo zálohy.
Pred každou aktualizáciou odporúčame urobiť v aplikácii export zálohy.

## 5. Výmena `APP_TOKEN`

1. Vygeneruj nový token a ulož ho ako secret Workera (pozri `server/README.md`):

   ```powershell
   cd ..\server
   node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
   npx wrangler secret put APP_TOKEN
   ```

2. Aktualizuj premennú v EAS (hodnotu opäť zadaj na výzvu, nie v príkaze):

   ```powershell
   cd ..\app
   npx eas-cli@latest env:update --environment preview
   ```

   Ak `env:update` nevyhovuje, premennú zmaž (`env:delete`) a vytvor znova
   cez `env:create`.
3. Zostav a nainštaluj nový APK (krok 4). Kým mama nemá novú verziu, import
   z odkazov/screenshotov nepôjde (server starý token odmietne). Zvyšok
   aplikácie funguje offline.
4. Aktualizuj aj `app/.env` pre vývoj.

## 6. Kontrolný zoznam testu s mamou

- [ ] Zdieľať screenshot receptu do aplikácie (z Galérie, Zdieľať, Recepty).
- [ ] Zdieľať odkaz na recept z prehliadača.
- [ ] Opraviť extrahovaný recept vo formulári a uložiť.
- [ ] Vyhľadať recept podľa názvu.
- [ ] Filtrovať podľa kategórie.
- [ ] Prepočítať porcie.
- [ ] V detaile receptu displej nezhasína.
- [ ] Exportovať zálohu.

## 7. Známe obmedzenia

- iOS je druhá fáza (Apple Developer účet, TestFlight); tento návod je len
  pre Android.
- Záloha sa ako "naposledy urobená" počíta, keď sa zatvorí zdieľací dialóg,
  aj keby sa súbor nikam neuložil.
- Každý import cez Claude stojí pár centov.
- Server má denný limit 50 importov.
