// Registers the "@/..." → apps/hub/... resolver for node-run tests, mirroring
// apps/hub/jsconfig.json ("@/*" → "*"). Lets `node --test` load repository
// modules that Next normally resolves. Usage: node --import ./scripts/register-hub-alias.mjs --test …
import { register } from "node:module";

register(new URL("./hub-alias-hooks.mjs", import.meta.url));
