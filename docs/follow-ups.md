# Čo ostáva po implementácii

Stav k 2026-11-24, vetva `feature/recipes-app`. Od 2026-11-25 server namiesto Claude volá Gemini (Google AI Studio). Všetkých 17 úloh plánu je hotových a skontrolovaných. Testy prechádzajú: core 32, server 59, app 151.

## Kroky, ktoré musí urobiť vývojár (účty, telefón, platené volania)

1. **Test Gemini API (na bezplatnom pláne v rámci denného limitu).** V `server/` vlož kľúč `GEMINI_API_KEY` do `.dev.vars`. Potom spusti `npx.cmd tsx --env-file=.dev.vars scripts/smoke.ts`. Over tieto položky:
   - „½ lyžičky soli“ → `amount: 0.5, unit: CL`
   - „2–3 strúčiky“ → `amount: 2, amountMax: 3, unit: strucik`
   - soľ podľa chuti → `amount: null`
2. **Nasadenie servera** podľa [server/README.md](../server/README.md). Prihlasovacie priečinky Wrangler sú už zapísané v [INSTALLED.md](../INSTALLED.md).
3. **Vývojová verzia v testovacom telefóne** podľa [docs/install.md](install.md), sekcia 2.
4. **Skúška v telefóne.** Overuj na vývojovej verzii, sekcia 6 v install.md:
   - Zatvor aplikáciu (vynútené zastavenie) a potom do nej zdieľaj screenshot. Musí sa otvoriť „Čítam recept…“.
   - Zdieľaj odkaz z Chromu, recept so screenshotom aj dlhý „scroll“ screenshot.
   - Zdieľaj odkaz z Facebooku. Aplikácia má odporučiť poslať screenshot.
   - Vytvor, uprav a zmaž recept, pridaj a odstráň fotku.
   - Vyskúšaj prepočet porcií a over, že obrazovka nezhasína.
   - Zálohuj recepty, odinštaluj aplikáciu, nainštaluj ju znova a obnov zálohu.
   - Počas skúšania sleduj `npx.cmd wrangler tail` a čas CPU v Cloudflare. Bezplatný plán má nízky limit CPU na jednu požiadavku.
   - Zapisuj si, čo AI rozpoznala zle. Podľa toho sa upraví prompt.
5. **Verzia pre mamu** podľa install.md, sekcia 3.

## Odložené drobnosti (nebránia testovaniu)

**Server**
- Ignoruje kódovanie stránky (windows-1250). Na starších SK/CZ weboch môže pokaziť diakritiku.
- Niektoré regulárne výrazy sú pomalé pri patologickom HTML. Telo stránky je obmedzené na 3 MB.
- Token sa porovnáva bez konštantného času. Riziko je nízke.

**Aplikácia: import a obrázky**
- Pri odchode z obrazovky importu sa platená požiadavka nezruší.
- Každý obrázok sa pri importe dekóduje dvakrát. Pri chybe dekódovania sa neuvoľní natívny kontext.
- Dočasné dlaždice ostávajú v cache, systém ich časom zmaže.

**Aplikácia: formulár a obrazovky**
- Množstvá ako „1/2“, „½“ či „2–3“ zadané ručne vo formulári sa uložia bez množstva.
- Chýba upozornenie na neuložené zmeny vo formulári.
- Niektoré chyby na obrazovkách sa ticho ignorujú, napríklad zlyhanie mazania alebo otvorenia odkazu.

**Aplikácia: záloha**
- „Posledná záloha“ sa zaznamená už po zatvorení dialógu Zdieľať, aj keď sa nič neuložilo.
- Ak sa po obnove nepodarí presunúť obrázky, niektoré môžu chýbať. Pomôže opakovať obnovu.

**Ostatné**
- Ikona aplikácie je zatiaľ predvolená z Expo.
- iOS je druhá fáza (Apple Developer účet, TestFlight).
