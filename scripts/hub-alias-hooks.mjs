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

const fromProject = (context) => Boolean(context.parentURL?.startsWith(PROJECT_ROOT.href)) && !context.parentURL.includes("/node_modules/");

export async function resolve(specifier, context, nextResolve) {
  // Component tests import real .jsx trees, which carry Next-only habits: CSS side-effect
  // imports and extensionless relative paths ("./hub-primitives" → .jsx). Both only ever
  // failed before, so ordinary JS resolution is unchanged.
  if (fromProject(context) && specifier.endsWith(".css")) {
    return { url: "data:text/javascript,", shortCircuit: true };
  }
  if (fromProject(context) && /^\.\.?\//.test(specifier) && !/\.(?:[cm]?js|jsx|json)$/.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const candidate of [`${base.href}.js`, `${base.href}.jsx`, `${base.href}/index.js`]) {
      if (await exists(new URL(candidate))) return nextResolve(candidate, context);
    }
  }

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
