// Module-resolution hooks: map "@/x" to apps/hub/x with Next-style extensionless
// resolution (.js, /index.js).
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const HUB_ROOT = new URL("../apps/hub/", import.meta.url);

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
