import { generateGeminiText } from "./gemini.ts";
import type { GeminiMediaPart } from "./gemini.ts";


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

export const MULTIMODAL_INTAKE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    summary: { type: "STRING" },
    transcription: { type: "STRING" },
    actionItems: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          task: { type: "STRING" },
          suggestedDue: { type: "STRING" },
          priority: { type: "STRING", enum: ["high", "medium", "low"] },
        },
        required: ["task", "priority"],
      },
    },
    keyDecisions: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    suggestedTags: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    detectedEntities: {
      type: "OBJECT",
      properties: {
        projects: { type: "ARRAY", items: { type: "STRING" } },
        peopleOrCompanies: { type: "ARRAY", items: { type: "STRING" } },
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
5. [actionItems]: 운영자가 즉시 실행해야 할 후속 조치나 할 일을 구체적인 작업 단위로 분리합니다. 기한이 언급되었다면 ISO 날짜(YYYY-MM-DD) 또는 구체적 시점을 suggestedDue에 넣습니다.
6. [keyDecisions]: 확정된 결정 사항, 합의 사항을 정리합니다.
7. [suggestedTags]: 메모 검색과 분류에 유용한 태그들을 해시태그 기호 없이 한글 단어로 추출합니다.
8. [detectedEntities]: 언급된 프로젝트명, 인물, 회사명을 분리 추출합니다.`;

export async function extractMultimodalIntake(
  input: MultimodalIntakeInput,
  generateFn = generateGeminiText,
): Promise<{ ok: boolean; status: number | null; data: MultimodalIntakeResult | null; error?: string }> {
  const hasMedia = Array.isArray(input.media) && input.media.length > 0;
  const hasText = typeof input.text === "string" && input.text.trim().length > 0;

  if (!hasMedia && !hasText) {
    return {
      ok: false,
      status: 400,
      data: null,
      error: "media 또는 text 중 최소 하나가 필요합니다.",
    };
  }

  const prompt = [
    `입력 형식: ${input.kind || "auto"}`,
    input.scope ? `범위: ${input.scope}` : "",
    input.instruction ? `운영자 추가 지침: ${input.instruction}` : "",
    input.text ? `제공된 텍스트:\n${input.text}` : "",
    "위 입력을 정밀 분석하여 정해진 스키마의 JSON으로만 출력하십시오.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await generateFn({
    prompt,
    systemInstruction: SYSTEM_INSTRUCTION,
    media: input.media,
    responseJsonSchema: MULTIMODAL_INTAKE_SCHEMA,
    maxOutputTokens: 8192,
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data: null,
      error: response.reason || "gemini-generation-failed",
    };
  }

  try {
    const parsed = JSON.parse(response.text) as MultimodalIntakeResult;
    return {
      ok: true,
      status: 200,
      data: {
        title: parsed.title || "무제 인테이크",
        summary: parsed.summary || "",
        transcription: parsed.transcription || "",
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        keyDecisions: Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions : [],
        suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : [],
        detectedEntities: {
          projects: Array.isArray(parsed.detectedEntities?.projects)
            ? parsed.detectedEntities.projects
            : [],
          peopleOrCompanies: Array.isArray(
            parsed.detectedEntities?.peopleOrCompanies,
          )
            ? parsed.detectedEntities.peopleOrCompanies
            : [],
        },
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      data: null,
      error: `JSON 파싱 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
