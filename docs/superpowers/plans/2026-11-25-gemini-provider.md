# Gemini provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Claude call in the Cloudflare Worker with Google Gemini (AI Studio key) without changing the `/extract` contract.

**Architecture:** `server/src/ai.ts` gets `createGeminiAI` implementing the existing `RecipeAI` interface. Everything else in the server (`extract.ts`, `handler.ts`) and the whole app stay untouched.

**Tech Stack:** `@google/genai` (official Google GenAI JS SDK), zod 4, vitest, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-11-25-gemini-provider-design.md`

## Global Constraints

- `/extract` request/response/error codes unchanged; `RecipeAI` / `AiInput` / `AiResult` types unchanged.
- Secret `GEMINI_API_KEY` (Worker secret, never in code or logs). Var `GEMINI_MODEL` in `wrangler.toml`, default `gemini-3.8-flash`.
- Prompt text from `server/src/prompt.ts` unchanged.
- Logs: only error class name, numeric status, finish/block reason — never request or response content.
- No real API calls in tests or during implementation (the smoke script is written, not run).

## Review Focus

1. Gemini returns text that is not valid JSON or misses fields → must be `ai_failed`, never a crash or a partially filled recipe.
2. Response blocked by safety filters (no candidates / `promptFeedback.blockReason`) → `ai_failed`.
3. The zod → JSON-schema conversion must produce a schema Gemini accepts (nullable fields, enum of unit codes, integer fields).
4. Images keep their order and mime type.
5. Missing `GEMINI_API_KEY` at runtime → `ai_failed` per request, not a Worker crash at startup.

---

### Task 1: Gemini AI adapter, config and docs

**Files:**
- Modify: `server/src/ai.ts` (replace Claude code), `server/src/index.ts`, `server/wrangler.toml`, `server/package.json` (+ root `package-lock.json`), `server/.dev.vars.example`, `server/scripts/smoke.ts`, `server/README.md`, `docs/install.md`, `docs/follow-ups.md`
- Test: `server/test/extract.test.ts` (createClaudeAI tests → createGeminiAI tests)

**Interfaces:**
- Consumes: `ExtractedRecipeSchema` (core), `SYSTEM_PROMPT`, `imagesInstruction`, `textInstruction` (prompt.ts), `errorInfo` (log.ts)
- Produces:
  - `export const DEFAULT_MODEL = 'gemini-3.8-flash'`
  - `export interface GenerateClient { models: { generateContent(params: GeminiParams): Promise<GeminiResponseLike> } }` — minimal subset of the SDK client so tests can inject a fake; `GeminiParams` typed from the SDK's `GenerateContentParameters`.
  - `export function createGeminiAI(apiKey: string, model?: string, client?: GenerateClient): RecipeAI`
  - Worker env: `GEMINI_API_KEY` (secret), `GEMINI_MODEL` (var); `ANTHROPIC_API_KEY` removed.

Request shape (check exact names against the installed `@google/genai` typings):
- `model`, `contents: [{ role: 'user', parts: [...images as { inlineData: { mimeType, data } }, { text: instruction }] }]`
- `config: { systemInstruction: SYSTEM_PROMPT, responseMimeType: 'application/json', responseJsonSchema: <JSON schema of AiRecipeSchema> }`
- Read text via the SDK's `response.text`; parse with `JSON.parse`, validate with `AiRecipeSchema.safeParse`.

- [ ] **Step 1: Install `@google/genai`, remove `@anthropic-ai/sdk`** from the server workspace (`npm.cmd i -w server @google/genai`, `npm.cmd uninstall -w server @anthropic-ai/sdk`). Read the installed package's typings / README for `generateContent`, `inlineData`, `responseMimeType`, `responseJsonSchema` (or `responseSchema`), `systemInstruction`, `response.text`, block reasons.
- [ ] **Step 2: Write failing tests** in `server/test/extract.test.ts` replacing the `createClaudeAI` block. Cases (fake client):
  - success: response text is valid JSON with `isRecipe: true` → `{ ok: true, recipe }` without `isRecipe`
  - `isRecipe: false` → `not_a_recipe`
  - invalid JSON text → `ai_failed`
  - JSON missing required fields → `ai_failed`
  - empty/undefined text (blocked) → `ai_failed`
  - SDK throws → `ai_failed`
  - request shape: `model` equals the passed model; `config.systemInstruction === SYSTEM_PROMPT`; `config.responseMimeType === 'application/json'`; schema present; images passed as `inlineData` in order with their mime types, followed by one text part
  - schema guard: the JSON schema sent has `isRecipe` and `ingredientGroups` in `required` and the unit enum contains `'CL'`
- [ ] **Step 3: Run** `npm.cmd test -w server` → FAIL.
- [ ] **Step 4: Implement** `createGeminiAI` in `server/src/ai.ts`; wire `server/src/index.ts` (`createGeminiAI(env.GEMINI_API_KEY, env.GEMINI_MODEL || DEFAULT_MODEL)`); add `GEMINI_MODEL = "gemini-3.8-flash"` under `[vars]` in `wrangler.toml`; update `.dev.vars.example` (`GEMINI_API_KEY=`). Construct the SDK client lazily inside `extract` or guard so a missing key yields `ai_failed`, not a startup crash.
- [ ] **Step 5: Run** `npm.cmd test -w server` and `npm.cmd run typecheck -w server` → PASS; also `npx.cmd wrangler deploy --dry-run` from `server/` (no account needed for dry run; skip and say so if it asks for login).
- [ ] **Step 6: Docs.** `scripts/smoke.ts` uses `GEMINI_API_KEY` and `createGeminiAI`; `server/README.md`: Anthropic → Google AI Studio (https://aistudio.google.com/apikey), `wrangler secret put GEMINI_API_KEY`, note that on the free plan Google may use submitted content to improve its products, how to change `GEMINI_MODEL`; replace all `npx`/`npm` commands in README and `docs/install.md` with `npx.cmd`/`npm.cmd` (PowerShell execution policy) plus one sentence why; `docs/follow-ups.md`: Claude → Gemini wording. Grep the repo (excluding node_modules, docs/superpowers) for `ANTHROPIC`, `anthropic`, `Claude` and fix remaining user-facing mentions.
- [ ] **Step 7: Full check** root `npm.cmd test`, then commit (message ends with blank line + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
