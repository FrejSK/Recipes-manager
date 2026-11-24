# Recepty pre mamu: návrh aplikácie

Dátum: 2026-11-24

## Prečo

Mama si recepty z internetu ukladá ako screenshoty. Tie sa jej strácajú medzi
ostatnými fotkami a nebaví ju hľadať ich v galérii. Chceme jedno miesto, kde
bude mať všetky recepty v rovnakom, prehľadnom formáte a rýchlo ich nájde podľa
názvu alebo kategórie.

Aplikácia je pre jednu používateľku (mamu) na jednom telefóne s Androidom.
Má byť postavená tak, aby neskôr fungovala aj na iOS.

## Ciele

- Recept sa dá pridať z **obrázka** (hlavne screenshotu, aj viacerých naraz),
  z **textu** alebo z **URL** a vždy sa uloží v jednom jednotnom formáte.
- Pridanie je čo najjednoduchšie. Ide aj cez systémové **Zdieľať** (screenshot
  aj odkaz z prehliadača) priamo do aplikácie, bez otvárania galérie.
- Pred uložením sa vždy ukáže formulár na kontrolu a úpravu toho, čo
  rozpoznala AI.
- Recept sa dá rýchlo nájsť podľa názvu a prechádzať podľa kategórií.
- V detaile receptu sa dajú prepočítať množstvá surovín podľa počtu porcií.
- Recepty sú uložené v telefóne a nestratia sa pri výmene telefónu (záloha).

## Mimo rozsahu

- Hromadný import starých screenshotov z galérie (výber mnohých obrázkov
  naraz, z ktorých vznikne veľa receptov).
- Odškrtávanie surovín alebo krokov počas varenia.
- Účty, prihlasovanie, synchronizácia medzi zariadeniami, zdieľanie receptov
  s inými ľuďmi.
- Nákupný zoznam, plánovanie jedál, nutričné hodnoty.
- Verejné zverejnenie v obchodoch (App Store / Google Play) ako produkt pre
  iných ľudí.

## Čo by bolo zlyhaním, aj keby to technicky fungovalo

- Mama musí po importe veľa ručne opravovať a radšej sa vráti ku screenshotom.
- Pridanie receptu trvá dlhšie ako screenshot (veľa ťuknutí, kopírovanie).
- Recepty sa stratia (výmena telefónu, preinštalovanie).
- Prepočet porcií dáva nezmyselné čísla („1,333 vajca“, „0,4999 lyžičky“).

## Obmedzenia

- Vývojár (syn) pracuje na **Windowse**, nemá Mac. Pozná Javu.
- Recepty a obrázky sú uložené **lokálne v telefóne**, nie v cloude.
- Rozpoznanie receptu robí AI model v cloude, takže pri importe treba internet
  a obsah (obrázok, text, stránka) sa pošle modelu. Prezeranie receptov
  funguje aj offline.
- AI kľúč nesmie byť v aplikácii.
- Písmo bežnej veľkosti (mama nepotrebuje zväčšené rozhranie). Rozhranie
  v slovenčine.

## Zvažované prístupy

| Možnosť | Za | Proti |
|---|---|---|
| **A) React Native + Expo, AI cez malý proxy server** *(zvolené)* | Jeden kód v TypeScripte pre obe platformy. Expo zostaví iOS verziu v cloude (EAS Build), takže netreba Mac. AI kľúč je bezpečne na serveri a dá sa vymeniť bez novej verzie aplikácie. | Jeden diel navyše (malý server) a nový jazyk (TypeScript) pre vývojára s Javou. |
| B) React Native + Expo, AI kľúč v aplikácii | Bez servera, jednoduchšie. | Kľúč sa dá z aplikácie vytiahnuť. Jeho výmena znamená novú verziu aplikácie. |
| C) Flutter (Dart) | Kvalitný multiplatformový framework. | Bez Macu sa iOS verzia zostavuje ťažko. Dart vývojár nepozná. |
| D) Kotlin Multiplatform + Compose Multiplatform | Jazyk blízky Jave. | iOS build a hlavne iOS share extension (Swift, Xcode) bez Macu sú veľmi bolestivé. |
| E) Natívny Android v Kotline | Najjednoduchšie pre Javistu. | Iba Android, iOS by chýbal. |

Zamietnuté bez detailného porovnania: dve natívne aplikácie (dvojnásobok práce)
a webová aplikácia/PWA (na iOS nevie prijímať „Zdieľať“ zo screenshotu, horšie
udržanie zapnutej obrazovky).

**Zvolená je A.** Rozhodlo zostavovanie iOS verzie bez Macu (EAS Build)
a bezpečné uloženie AI kľúča.

## Architektúra

```
┌───────────────────────── Telefón (Expo app) ─────────────────────────┐
│  Obrazovky ─ Zoznam / Detail / Pridať / Kontrola / Kategórie / Nast. │
│  Lokálna DB (SQLite)      Súbory (obrázky receptov, originály)       │
│  Prijímanie „Zdieľať“ (obrázok, text, URL)                           │
└──────────────┬───────────────────────────────────────────────────────┘
               │ HTTPS: obrázky / text / URL  →  JSON receptu
┌──────────────▼──────────── Proxy server ─────────────────────────────┐
│  /extract  ─ URL: stiahne stránku → JSON-LD Recipe? → mapovanie       │
│                 inak text stránky → Claude                            │
│            ─ text / obrázky → Claude (štruktúrovaný výstup)           │
│  Drží AI kľúč, overuje tajný token aplikácie, limituje počet volaní   │
└──────────────┬───────────────────────────────────────────────────────┘
               ▼
          Claude API
```

### Mobilná aplikácia

- **Expo (React Native) + TypeScript.** Build cez EAS Build (Android aj iOS
  v cloude). Keďže treba prijímať „Zdieľať“, aplikácia beží ako *development
  build*, nie v Expo Go.
- **Lokálna databáza:** SQLite (`expo-sqlite`).
- **Obrázky** (originálne screenshoty a fotka jedla) sa ukladajú ako súbory do
  adresára aplikácie. V databáze sú len cesty.
- **Prijímanie zdieľania:** obrázok (aj viac naraz), text aj URL zo systémového
  menu Zdieľať na Androide aj iOS (napr. knižnica `expo-share-intent`; výber
  knižnice nechávam na staviteľa).
- **Obrazovka nezhasne**, kým je otvorený detail receptu (`expo-keep-awake`).

### Proxy server

- Malá serverless funkcia (napr. Cloudflare Worker) v TypeScripte s oficiálnym
  SDK `@anthropic-ai/sdk`.
- Jeden endpoint `POST /extract`, ktorý prijme jeden z typov vstupu
  (`images[]`, `text`, `url`) a vráti recept v jednotnom formáte (JSON).
- Ochrana: aplikácia posiela tajný token v hlavičke. Server odmietne požiadavky
  bez neho a má denný limit počtu volaní. Na účte Anthropic je nastavený
  mesačný limit míňania.
- Server si recepty **neukladá**. Je to len prekladač vstup → JSON.

### Import

Všetky tri cesty končia rovnako: **JSON receptu → formulár Kontrola → uložiť**.

1. **Obrázky:** aplikácia obrázky zmenší a skomprimuje (dlhé screenshoty
   nesmú stratiť čitateľnosť) a pošle ich na server. Claude prečíta všetky
   obrázky naraz ako jeden recept. Originály sa uložia k receptu.
2. **Text:** vložený alebo zdieľaný text ide na server a Claude ho prevedie
   do formátu.
3. **URL:** server stiahne stránku. Ak obsahuje schema.org `Recipe` v JSON-LD,
   prevezme názov, suroviny, postup, porcie, časy a fotku. Suroviny z JSON-LD sú
   len textové riadky, preto ich Claude ešte rozdelí na množstvo, jednotku
   a názov a navrhne kategóriu. Ak JSON-LD chýba, Claude dostane očistený text
   stránky. Fotka jedla sa stiahne a uloží lokálne.

**AI model:** `claude-opus-5-5` so štruktúrovaným výstupom (JSON schéma
receptu), aby odpoveď vždy zodpovedala formátu. Pri očakávanom objeme (pár
receptov týždenne) sú náklady rádovo desiatky centov mesačne. Model sa dá
neskôr zmeniť na serveri bez novej verzie aplikácie.

**Pravidlá pre AI** (v prompte):
- Neprekladá a nevymýšľa. Čo nie je v zdroji, ostane prázdne.
- Rozdelí každú surovinu na množstvo (číslo), jednotku (z pevného zoznamu)
  a názov. „Soľ podľa chuti“ nemá množstvo.
- Zachová skupiny surovín, ak ich recept má (napr. „Na cesto“, „Na plnku“).
- Navrhne jednu alebo viac kategórií z existujúceho zoznamu (zoznam pošle
  aplikácia).
- Ak obsah nie je recept, vráti chybu, ktorú aplikácia ukáže ľudsky.

### Formát receptu

Vychádza zo schema.org/Recipe, zjednodušený:

```ts
type Recipe = {
  id: string;
  title: string;
  servings: number | null;         // pôvodný počet porcií
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  ingredientGroups: {
    name: string | null;           // napr. "Na cesto", null = bez skupiny
    items: {
      amount: number | null;       // 0.5; null = bez množstva
      amountMax: number | null;    // pre rozsahy "2–3"
      unit: Unit | null;           // z pevného zoznamu
      name: string;                // "hladká múka"
      note: string | null;         // "nadrobno nakrájaná"
    }[];
  }[];
  steps: string[];
  categoryIds: string[];
  notes: string | null;            // mamine poznámky
  photo: string | null;            // lokálna cesta k fotke jedla
  sourceImages: string[];          // lokálne cesty k originálnym screenshotom
  sourceUrl: string | null;
  sourceText: string | null;       // pôvodný text pri importe z textu
  createdAt: string;
  updatedAt: string;
};
```

**Jednotky** sú pevný zoznam s rozlíšením, či sa dajú prepočítavať: g, kg,
ml, dl, l, ks, PL (polievková lyžica), ČL (čajová lyžička), KL (kávová
lyžička), šálka, hrnček, balenie, plátok, strúčik, štipka, hrsť, konzerva.
Neznáma jednotka z AI sa zapíše do `note` a `unit` ostane prázdne.

### Kategórie

- Predvolené: Polievky, Hlavné jedlá, Prílohy, Šaláty, Koláče a dezerty,
  Pečivo, Nápoje.
- Mama ich môže pridávať, premenovať a mazať. Recept môže byť vo viacerých
  kategóriách. Zmazaním kategórie sa recepty nemažú.
- AI pri importe navrhne kategórie, mama ich vo formulári potvrdí.

## Obrazovky

1. **Zoznam receptov** (úvodná): vyhľadávanie hore, kategórie ako vodorovné
   záložky („Všetko“ + kategórie), zoznam s fotkou a názvom, tlačidlo
   „Pridať recept“.
2. **Pridať recept:** tri voľby: „Obrázok / screenshot“ (výber z galérie,
   viac naraz, alebo fotoaparát), „Vložiť text“, „Vložiť odkaz“.
3. **Načítavanie:** jasný stav „Čítam recept…“. Pri chybe (bez internetu,
   nie je to recept, server nedostupný) zrozumiteľná správa a možnosť
   skúsiť znova alebo vyplniť recept ručne.
4. **Kontrola / úprava:** formulár so všetkými poľami receptu, predvyplnený
   z AI. Pri importe z obrázkov sú originály viditeľné na porovnanie. Ten istý
   formulár slúži na neskoršiu úpravu aj na ručné pridanie receptu.
5. **Detail receptu:** fotka, názov, kategórie, čas, počet porcií s **−/+**,
   suroviny (prepočítané), očíslovaný postup, poznámky, originálne
   screenshoty / odkaz na zdroj. Obrazovka nezhasne. Upraviť / zmazať.
6. **Kategórie:** správa zoznamu kategórií.
7. **Nastavenia / Záloha:** export a import zálohy.

Príjem zo „Zdieľať“ otvorí priamo krok 3 a potom 4.

### Vyhľadávanie

Podľa názvu, bez ohľadu na diakritiku a veľkosť písmen, aj na časť slova
(„gulas“ nájde „Hovädzí guláš“). Pri malom počte receptov stačí filtrovanie
v pamäti alebo normalizovaný stĺpec v SQLite.

### Prepočet porcií

- Faktor = zvolené porcie / pôvodné porcie. Ak recept porcie nemá, −/+ sa
  neukazuje.
- Prepočítavajú sa iba suroviny s množstvom. Zmena sa neukladá, po zatvorení
  sa ukáže pôvodný počet.
- Zaokrúhľovanie podľa jednotky: g/ml rozumne (napr. na 5 g pri väčších
  množstvách), lyžice a lyžičky na štvrtiny/polovice so zlomkami („1½ PL“),
  ks na celé alebo polovice, štipka/hrsť sa nezaokrúhľuje na desatiny.

## Záloha

- **Ručný export:** všetky recepty a obrázky do jedného súboru (ZIP s JSON
  a obrázkami), ktorý sa cez systémové Zdieľať uloží napr. na Google Drive,
  iCloud alebo pošle mailom. **Import** zo zálohy obnoví všetko.
- **Pripomienka:** aplikácia občas (napr. raz mesačne, ak pribudli recepty)
  pripomenie export.
- Systémové zálohovanie telefónu (Android Auto Backup, iCloud záloha) je
  bonus, ale nespoliehame sa naň. Android Auto Backup má limit 25 MB, čo
  obrázky rýchlo prekročia.

## Distribúcia a poradie platforiem

Mama má **Android**. Preto:

- **Android je hlavná platforma.** Na ňom sa všetko stavia, ladí a testuje
  (vrátane „Zdieľať“). Mame sa nainštaluje inštalačný súbor (APK) z EAS Build.
- **iOS je druhá fáza.** Kód je spoločný a nemá obsahovať nič, čo by iOS
  vylučovalo, ale iOS build, share extension a distribúcia (Apple Developer
  účet 99 $/rok, TestFlight) sa riešia až po tom, ako mama používa Android
  verziu. Kým to nie je potrebné, Apple účet sa nekupuje.
- Obnova zálohy medzi platformami (Android → iPhone) sa v prvej fáze netestuje,
  ale formát zálohy nesmie obsahovať nič platformovo špecifické (napr.
  absolútne cesty k súborom).

## Rozhodnutia navrhovateľa (na kontrolu)

- **Odkazy zo sociálnych sietí** (Facebook, Instagram, YouTube) server väčšinou
  nestiahne (prihlásenie, žiadne štruktúrované dáta). Keď sa z odkazu recept
  nepodarí získať, aplikácia odporučí poslať radšej screenshot.
- **Kto stavia:** implementáciu robí Claude podľa plánu. Plán musí obsahovať
  explicitné kroky, ktoré urobí vývojár sám (účet Expo/EAS, Anthropic API kľúč
  a limit míňania, Cloudflare účet, prípadne Apple Developer účet), a krátke
  vysvetlenia vecí z TypeScriptu a React Native, ktoré Javista nepozná.
- **Obnova zo zálohy** nahradí aktuálne recepty (s potvrdením), nespája ich.

## Čo je na staviteľovi

- Konkrétne knižnice (zdieľanie, navigácia, UI komponenty, ZIP), štruktúra
  projektu, štýl rozhrania.
- Prompt pre AI a presná JSON schéma pre štruktúrovaný výstup (podľa formátu
  vyššie).
- Detaily zmenšovania obrázkov, extrakcie textu zo stránky a pravidiel
  zaokrúhľovania.
- Testy: hlavne prepočet porcií, mapovanie JSON-LD a parsovanie odpovedí AI.
- Hosting proxy servera (Cloudflare Worker je návrh, nie podmienka).
