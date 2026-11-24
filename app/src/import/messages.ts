import type { ClientErrorCode } from './extract-client';

const GENERIC = 'Recept sa nepodarilo prečítať. Skús to znova alebo ho vyplň ručne.';

export function errorMessage(code: ClientErrorCode): string {
  switch (code) {
    case 'network':
      return 'Nepodarilo sa spojiť so serverom. Skontroluj pripojenie na internet a skús znova.';
    case 'timeout':
      return 'Čítanie receptu trvá príliš dlho. Skús to znova.';
    case 'not_a_recipe':
      return 'V tomto obsahu sa nenašiel žiadny recept.';
    case 'url_unreadable':
      return 'Z tohto odkazu sa recept nedá načítať. Skús radšej poslať screenshot.';
    case 'rate_limited':
      return 'Dnes sa už načítalo veľa receptov. Skús to zajtra alebo recept vyplň ručne.';
    case 'image_too_long':
      return 'Obrázok je príliš dlhý. Rozdeľ ho na viac screenshotov.';
    default:
      return GENERIC;
  }
}
