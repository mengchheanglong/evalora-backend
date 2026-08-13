/**
 * Manual harness for the document-to-template pipeline, run against the real
 * DeepSeek provider. It extracts a local document exactly the way the API does,
 * generates a draft, and reports how faithfully the draft preserves the
 * document's own questions; an optional second argument then exercises the chat
 * refinement path against the same source.
 *
 * Usage:
 *   pnpm tsx scripts/test-doc-draft.ts <path-to-document> ["refine instruction"]
 */
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createDeepSeekProviderFromEnv } from "../src/modules/ai/deepseek.provider";
import { normalizeDraft } from "../src/modules/templates/drafts/draft-normalizer";
import { DocumentExtractionService } from "../src/modules/templates/drafts/document-extraction.service";
import type { TemplateDraft } from "../src/modules/templates/drafts/template-draft.types";

// tsx does not load .env; mirror only what the provider reads.
for (const line of readFileSync(resolve(__dirname, "../.env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Pass a document path.");
  const instruction = process.argv[3];

  const extracted = await new DocumentExtractionService().extract({
    buffer: readFileSync(filePath),
    originalname: basename(filePath),
  });
  console.log(`extracted ${extracted.text.length} chars from ${extracted.fileName} (${extracted.format}, truncated: ${extracted.truncated})`);

  const provider = createDeepSeekProviderFromEnv();

  console.time("generate");
  const proposal = await provider.generateTemplateDraft({ sourceText: extracted.text });
  console.timeEnd("generate");
  const draft = normalizeDraft(proposal, {});
  report("GENERATED", draft, extracted.text);

  if (instruction) {
    console.time("refine");
    const refined = await provider.refineTemplateDraft({
      currentDraft: draft,
      message: instruction,
      sourceText: extracted.text,
    });
    console.timeEnd("refine");
    console.log(`reply: ${refined.reply}\nchanged: ${refined.changed}`);
    if (refined.draft) report("REFINED", normalizeDraft(refined.draft, {}), extracted.text);
  }
}

/** Prints the draft's shape and how many questions appear verbatim in the source. */
function report(label: string, draft: TemplateDraft, docText: string) {
  const doc = canon(docText);
  let total = 0;
  let verbatim = 0;

  console.log(`\n[${label}] ${draft.title} — role "${draft.roleType}", ${draft.modules.length} modules, ${draft.timeLimitMin} min`);
  for (const module of draft.modules) {
    const hits = module.questions.filter((question) => doc.includes(canon(question.questionText))).length;
    total += module.questions.length;
    verbatim += hits;
    console.log(`  [${module.type}] ${module.title} — ${module.questions.length} questions (${hits} verbatim), weight ${module.weight}%`);
  }
  console.log(`verbatim questions: ${verbatim}/${total}`);
  if (draft.warnings.length) console.log(`warnings: ${draft.warnings.join(" | ")}`);
}

function canon(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
