export const CANONICAL_CONTENT_VARIANT_TYPES = [
  "newsletter",
  "blog_insight",
  "card_news",
  "x_thread",
  "reels_script",
];

const CONTENT_VARIANT_TYPE_ALIASES = {
  blog: "blog_insight",
  insight: "blog_insight",
  landing_copy: "blog_insight",
  carousel: "card_news",
  social_post: "x_thread",
  thread: "x_thread",
  reels: "reels_script",
  reel: "reels_script",
  video_script: "reels_script",
};

export function normalizeContentVariantType(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  const candidate = CONTENT_VARIANT_TYPE_ALIASES[normalized] || normalized;

  return CANONICAL_CONTENT_VARIANT_TYPES.includes(candidate)
    ? candidate
    : "blog_insight";
}
