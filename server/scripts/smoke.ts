/// <reference types="node" />
// Paid smoke test against the real Claude API (about a cent per run). Ask before running.
// Usage (from server/): ANTHROPIC_API_KEY=... npx tsx scripts/smoke.ts
// Expect in the output: soľ "½ lyžičky" → amount 0.5, unit "CL"; cesnak → amount 2, amountMax 3,
// unit "strucik"; "soľ podľa chuti" → amount null.
import { createClaudeAI } from '../src/ai';

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

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

const categories = ['Polievky', 'Hlavné jedlá', 'Dezerty'];
const result = await createClaudeAI(apiKey).extract({ kind: 'text', text: RECIPE }, categories);
console.log(JSON.stringify(result, null, 2));
