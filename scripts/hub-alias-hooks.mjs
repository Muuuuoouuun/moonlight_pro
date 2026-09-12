// Module-resolution hooks: map "@/x" to apps/hub/x with Next-style extensionless
// resolution (.js, /index.js).
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const HUB_ROOT = new URL("../apps/hub/", import.meta.url);
const PROJECT_ROOT = new URL("../", import.meta.url);

async function exists(url) {
  try {
    await access(fileURLToPath(url));
    return true;
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

  const base = new URL(specifier.slice(2), HUB_ROOT);
  const candidates = [base, new URL(`${base.href}.js`), new URL(`${base.href}/index.js`)];

  for (const candidate of candidates) {
    if (candidate.href.match(/\.(js|mjs|cjs|json)$/) && (await exists(candidate))) {
      return nextResolve(candidate.href, context);
    }
  }

  return nextResolve(base.href, context);
}

// Next compiles JSX in the app; node --test needs the equivalent only when a
// test imports a local component. Keep ordinary JS and dependencies untouched.
export async function load(url, context, nextLoad) {
  if (!url.startsWith(PROJECT_ROOT.href) || url.includes("/node_modules/") || !new URL(url).pathname.endsWith(".jsx")) {
    return nextLoad(url, context);
  }

  const ts = await import("typescript");
  const result = ts.transpileModule(await readFile(new URL(url), "utf8"), {
    fileName: fileURLToPath(url),
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  const errors = result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) || [];
  if (errors.length) {
    throw new SyntaxError(`${fileURLToPath(url)}: ${errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n")}`);
  }
  return { format: "module", source: result.outputText, shortCircuit: true };
}
