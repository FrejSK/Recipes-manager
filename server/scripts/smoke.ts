/// <reference types="node" />
// Smoke test against the real Gemini API (free tier: uses the daily quota; paid tier: billed per token). Ask before running.
// Usage (from server/, key in .dev.vars, never on the command line): npx.cmd tsx --env-file=.dev.vars scripts/smoke.ts
// Expect in the output: soľ "½ lyžičky" → amount 0.5, unit "CL"; cesnak → amount 2, amountMax 3,
// unit "strucik"; "soľ podľa chuti" → amount null.
import { createGeminiAI, DEFAULT_MODEL } from '../src/ai';

const RECIPE = `Cesnaková polievka

Suroviny:
- 1 l vody
- 4 zemiaky
- 2-3 strúčiky cesnaku
- ½ lyžičky soli
- 50 g masla
- soľ podľa chuti

Postup:
1. Zemiaky ošúpeme, nakrájame na kocky a uvaríme vo vode so soľou.
2. Pridáme roztlačený cesnak a maslo.
3. Dochutíme soľou a podávame s chlebom.`;

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set.');
  process.exit(1);
}

const categories = ['Polievky', 'Hlavné jedlá', 'Dezerty'];
const result = await createGeminiAI(apiKey, process.env.GEMINI_MODEL || DEFAULT_MODEL, undefined, {
  fallbackModel: process.env.GEMINI_FALLBACK_MODEL,
}).extract({ kind: 'text', text: RECIPE }, categories);
console.log(JSON.stringify(result, null, 2));
