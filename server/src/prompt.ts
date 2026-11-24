export const SYSTEM_PROMPT = `You extract a single cooking recipe from the user's content (screenshots, text, or a recipe page) into the given JSON schema.
Rules:
- Keep the recipe's original language. Do not translate.
- Never invent anything. If a value is not in the source, use null (or an empty list).
- Split every ingredient line into amount (a number; convert fractions like "1/2" or "½" to 0.5), amountMax (only for ranges like "2-3"), unit, name and note.
- unit must be one of the allowed codes. Map Slovak/Czech/English units: "polievková lyžica"/"lžíce"/"tbsp" → PL, "čajová lyžička"/"lžička"/"tsp" → CL, "kávová lyžička" → KL, "kus"/"ks"/"pcs" → ks, "dkg" → convert to g (×10). If the unit is not in the list, set unit to null and put the original unit text into note.
- Ingredients without an amount (e.g. "soľ podľa chuti") have amount null and unit null; keep "podľa chuti" in note.
- Keep ingredient groups if the recipe has them (e.g. "Na cesto", "Na plnku"); otherwise use one group with name null.
- steps: one array item per step, without numbering.
- servings: an integer number of portions, or null.
- categoryNames: choose zero or more from the provided category list only, exact spelling.
- If the content is not a recipe, set isRecipe to false and fill the remaining fields with empty values.`;

function categoryList(categories: string[]): string {
  return categories.length > 0
    ? `Category list: ${categories.map((c) => JSON.stringify(c)).join(', ')}`
    : 'Category list: (empty, so categoryNames must be an empty list)';
}

export function imagesInstruction(categories: string[]): string {
  return `Extract the recipe from the screenshots above. They are in order and may continue one another.\n${categoryList(categories)}`;
}

export function textInstruction(text: string, categories: string[]): string {
  return `Extract the recipe from the content below.\n${categoryList(categories)}\n\n<content>\n${text}\n</content>`;
}
