// The existing Studio AI scene contract, shared by manual saves and AI output.
// Empty manual drafts are allowed; generated candidates must contain a scene.
export type ReelsScriptValidation = { ok: true } | { ok: false; reason: string; sceneNumber?: number };

const SCENE_FIELDS = ["id", "visual", "spoken", "subtitle", "duration", "notes"];
const TEXT_FIELDS = ["visual", "spoken", "subtitle", "notes"];
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

function validSceneText(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 16000 || value.includes("\u0000")) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

export function validateReelsScriptBody(body: string, { allowEmptyDraft = false } = {}): ReelsScriptValidation {
  const invalid = (reason: string, sceneNumber?: number): ReelsScriptValidation => ({ ok: false, reason,
    ...(sceneNumber === undefined ? {} : { sceneNumber }) });
  if (allowEmptyDraft && !body.trim()) return { ok: true };
  let value: unknown;
  try { value = JSON.parse(body); } catch { return invalid("invalid-reels-script-json"); }
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Array.isArray(value.scenes)
    || value.scenes.length < (allowEmptyDraft ? 0 : 1) || value.scenes.length > 30) return invalid("invalid-reels-script-scenes");
  const ids = new Set<string>();
  for (const [index, scene] of value.scenes.entries()) {
    const sceneNumber = index + 1;
    if (!isRecord(scene) || Object.keys(scene).length !== SCENE_FIELDS.length
      || !SCENE_FIELDS.every(field => Object.prototype.hasOwnProperty.call(scene, field))) return invalid("invalid-reels-script-fields", sceneNumber);
    if (typeof scene.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(scene.id)
      || ["constructor", "prototype"].includes(scene.id) || ids.has(scene.id)) return invalid("invalid-reels-script-id", sceneNumber);
    ids.add(scene.id);
    if (!TEXT_FIELDS.every(field => validSceneText(scene[field]))) return invalid("invalid-reels-script-text", sceneNumber);
    if (!(scene.visual as string).trim() && !(scene.spoken as string).trim()) return invalid("invalid-reels-script-content", sceneNumber);
    if (typeof scene.duration !== "number" || !Number.isFinite(scene.duration)
      || scene.duration <= 0 || scene.duration > 600) return invalid("invalid-reels-script-duration", sceneNumber);
  }
  return { ok: true };
}
