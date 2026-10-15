import { generateGeminiText } from "./gemini.ts";
import type { GeminiMediaPart } from "./gemini.ts";

const MAX_MEDIA_BYTES = 14 * 1024 * 1024;
const MEDIA_MIME = /^(?:image\/(?:png|jpeg|webp|heic|heif)|audio\/(?:wav|mp3|mpeg|aiff|aac|ogg|flac|m4a|l16|opus|alaw|mulaw|webm))$/;
const MIME_ALIASES: Record<string, string> = { "audio/mp4": "audio/m4a", "audio/x-m4a": "audio/m4a", "audio/x-wav": "audio/wav", "audio/x-aiff": "audio/aiff", "audio/x-flac": "audio/flac" };
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max && !value.includes("\0");
const isStringArray = (value: unknown, count: number, length: number): value is string[] => Array.isArray(value) && value.length <= count && value.every((item) => isText(item, length));

function isDueDate(value: unknown) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateInput(input: unknown): { status: number; error: string } | null {
  const invalid = (error: string, status = 400) => ({ status, error });
  if (!isObject(input)) return invalid("JSON 객체가 필요합니다.");
  for (const [key, limit] of [["text", 20000], ["instruction", 2000]] as const) {
    const value = input[key];
    if (value !== undefined && (typeof value !== "string" || value.length > limit)) return invalid(`${key}는 ${limit}자 이하의 문자열이어야 합니다.`);
  }
  if (input.kind !== undefined && (typeof input.kind !== "string" || !["image", "audio", "text", "auto"].includes(input.kind))) return invalid("올바른 입력 형식이 필요합니다.");
  if (input.scope !== undefined && (typeof input.scope !== "string" || !["personal", "company"].includes(input.scope))) return invalid("올바른 범위가 필요합니다.");
  if (input.media !== undefined && (!Array.isArray(input.media) || input.media.length > 8)) return invalid("미디어는 최대 8개까지 전달할 수 있습니다.");
  let totalBytes = 0;
  for (const item of (input.media || []) as unknown[]) {
    if (!isObject(item) || typeof item.mimeType !== "string" || !MEDIA_MIME.test(MIME_ALIASES[item.mimeType] || item.mimeType)
      || typeof item.base64 !== "string" || !item.base64) return invalid("지원되는 사진 또는 오디오 MIME 유형과 base64 데이터가 필요합니다.");
    if (item.base64.length > Math.ceil(MAX_MEDIA_BYTES / 3) * 4) return invalid("사진 및 오디오 파일은 합계 14MB 이하여야 합니다.", 413);
    if (item.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.base64)) return invalid("올바른 base64 미디어 데이터가 필요합니다.");
    totalBytes += item.base64.length / 4 * 3 - (item.base64.endsWith("==") ? 2 : item.base64.endsWith("=") ? 1 : 0);
    if (totalBytes > MAX_MEDIA_BYTES) return invalid("사진 및 오디오 파일은 합계 14MB 이하여야 합니다.", 413);
  }
  if (!totalBytes && !(typeof input.text === "string" && input.text.trim())) return invalid("media 또는 text 중 최소 하나가 필요합니다.");
  return null;
}

export interface MultimodalIntakeInput {
  kind: "image" | "audio" | "text" | "auto";
  media?: GeminiMediaPart[];
  text?: string;
  scope?: "personal" | "company";
  instruction?: string;
}

export interface ExtractedActionItem {
  task: string;
  suggestedDue?: string | null;
  priority: "high" | "medium" | "low";
}

export interface MultimodalIntakeResult {
  title: string;
  summary: string;
  transcription: string;
  actionItems: ExtractedActionItem[];
  keyDecisions: string[];
  suggestedTags: string[];
  detectedEntities: {
    projects: string[];
    peopleOrCompanies: string[];
  };
}

function isIntakeResult(value: unknown): value is MultimodalIntakeResult {
  if (!(isObject(value) && isText(value.title, 200) && isText(value.summary, 20000) && isText(value.transcription, 20000)
    && Array.isArray(value.actionItems) && value.actionItems.length <= 20
    && value.actionItems.every((item) => isObject(item) && isText(item.task, 300) && Boolean(item.task.trim())
      && typeof item.priority === "string" && ["high", "medium", "low"].includes(item.priority)
      && isDueDate(item.suggestedDue))
    && isStringArray(value.keyDecisions, 20, 1000) && isStringArray(value.suggestedTags, 8, 256)
    && value.suggestedTags.every((tag) => [...tag.normalize("NFC")].length <= 32 && !/[,，\n]/.test(tag))
    && isObject(value.detectedEntities) && isStringArray(value.detectedEntities.projects, 20, 200)
    && isStringArray(value.detectedEntities.peopleOrCompanies, 20, 200))) return false;
  const parts = [];
  if (value.summary) parts.push(`[핵심 요약]\n${value.summary}`);
  if (value.transcription) parts.push(`[전사/원문 내용]\n${value.transcription}`);
  if (value.keyDecisions.length) parts.push(`[결정사항]\n${value.keyDecisions.map((item) => `- ${item}`).join("\n")}`);
  return parts.join("\n\n").length <= 20000;
}

export const MULTIMODAL_INTAKE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "200자 이하의 제목" },
    summary: { type: "string" },
    transcription: { type: "string" },
    actionItems: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          task: { type: "string", description: "1~300자의 구체적인 할 일" },
          suggestedDue: { type: ["string", "null"], format: "date", description: "실제 YYYY-MM-DD 날짜. 확정할 수 없으면 null." },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["task", "priority"],
      },
    },
    keyDecisions: {
      type: "array",
      maxItems: 20,
      items: { type: "string" },
    },
    suggestedTags: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
    },
    detectedEntities: {
      type: "object",
      properties: {
        projects: { type: "array", maxItems: 20, items: { type: "string" } },
        peopleOrCompanies: { type: "array", maxItems: 20, items: { type: "string" } },
      },
      required: ["projects", "peopleOrCompanies"],
    },
  },
  required: [
    "title",
    "summary",
    "transcription",
    "actionItems",
    "keyDecisions",
    "suggestedTags",
    "detectedEntities",
  ],
};

const SYSTEM_INSTRUCTION = `당신은 1인 운영자의 개인 운영체제(Moonlight) 인텔리전트 인테이크 어시스턴트입니다.
업로드된 사진(화이트보드, 손글씨 메모, 문서, 스크린샷), 오디오(음성 녹음, 회의, 통화, 생각 메모), 또는 원시 텍스트를 분석하여 운영자의 인지적 부하를 최소화할 수 있도록 완벽히 구조화합니다.

원칙:
1. 없는 사실을 지어내지 마십시오(Zero Hallucination). 불분명한 내용은 임의로 단정하지 않습니다.
2. [title]: 50자 이내의 명확한 한글 제목을 부여합니다.
3. [summary]: 핵심 내용을 1~3문장의 명확한 개조식 또는 평서문으로 요약합니다.
4. [transcription]: 이미지에서 읽어낸 모든 텍스트 원문이나, 오디오에서 발화된 상세 전사 내용을 충실히 기록합니다.
5. [actionItems]: 운영자가 실행해야 할 후속 조치를 최대 20개, 각 300자 이내로 분리합니다. suggestedDue에는 원문에서 확정할 수 있는 실제 날짜(YYYY-MM-DD)만 넣습니다. 상대 날짜의 기준이 불분명하면 null로 두고 해당 표현은 원문 전사에 보존합니다.
6. [keyDecisions]: 확정된 결정 사항, 합의 사항을 정리합니다.
7. [suggestedTags]: 해시태그·쉼표·줄바꿈 없이 32자 이내의 태그를 최대 8개 추출합니다.
8. [detectedEntities]: 언급된 프로젝트명, 인물, 회사명을 분리 추출합니다.
9. 요약·전사·결정사항을 합친 메모는 구분 제목을 포함하여 20,000자 이하여야 합니다. 원문을 임의로 잘라내지 마십시오.`;

export async function extractMultimodalIntake(
  input: MultimodalIntakeInput,
  generateFn: typeof generateGeminiText = input => generateGeminiText({ ...input, usageSurface: input.usageSurface || 'multimodal-intake' }),
): Promise<{ ok: boolean; status: number | null; data: MultimodalIntakeResult | null; error?: string }> {
  const invalid = validateInput(input);
  if (invalid) return { ok: false, data: null, ...invalid };

  const prompt = [
    `입력 형식: ${input.kind || "auto"}`,
    input.scope ? `범위: ${input.scope}` : "",
    input.instruction ? `운영자 추가 지침: ${input.instruction}` : "",
    input.text ? `제공된 텍스트:\n${input.text}` : "",
    "위 입력을 정밀 분석하여 정해진 스키마의 JSON으로만 출력하십시오.",
  ]
    .filter(Boolean)
    .join("\n\n");

  let response;
  try {
    response = await generateFn({
      prompt,
      systemInstruction: SYSTEM_INSTRUCTION,
      media: input.media?.map((item) => ({ ...item, mimeType: MIME_ALIASES[item.mimeType] || item.mimeType })),
      responseJsonSchema: MULTIMODAL_INTAKE_SCHEMA,
      maxOutputTokens: 8192,
    });
  } catch {
    return { ok: false, status: 502, data: null, error: "Gemini API 요청에 실패했습니다." };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data: null,
      error: response.reason || "gemini-generation-failed",
    };
  }

  try {
    const parsed: unknown = JSON.parse(response.text);
    if (!isIntakeResult(parsed)) return { ok: false, status: 502, data: null, error: "분석 결과 형식이 올바르지 않습니다. 다시 시도해 주세요." };
    return {
      ok: true,
      status: 200,
      data: {
        title: parsed.title || "무제 인테이크",
        summary: parsed.summary,
        transcription: parsed.transcription,
        actionItems: parsed.actionItems,
        keyDecisions: parsed.keyDecisions,
        suggestedTags: parsed.suggestedTags,
        detectedEntities: {
          projects: parsed.detectedEntities.projects,
          peopleOrCompanies: parsed.detectedEntities.peopleOrCompanies,
        },
      },
    };
  } catch {
    return {
      ok: false,
      status: 502,
      data: null,
      error: "분석 결과 JSON을 읽을 수 없습니다. 다시 시도해 주세요.",
    };
  }
}
