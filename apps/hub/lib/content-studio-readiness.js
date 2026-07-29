function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlaceholderCopy(value) {
  return typeof value === "string" && value.trim().toLowerCase() === "new slide";
}

function hasMeaningfulSlideCopy(slide) {
  return (hasText(slide?.title) && !isPlaceholderCopy(slide.title)) || hasText(slide?.sub);
}

export function getContentStudioReadiness({ mode, title, body, slides = [] } = {}) {
  if (mode === "carousel") {
    const allSlidesReady = slides.length > 0 && slides.every(hasMeaningfulSlideCopy);
    return allSlidesReady
      ? { ready: true, message: "발행 준비됨" }
      : { ready: false, message: "모든 슬라이드에 제목이나 부제목을 입력하세요." };
  }

  if (!hasText(title)) {
    return { ready: false, message: "제목을 입력하세요." };
  }

  if (!hasText(body)) {
    return { ready: false, message: "본문을 입력하세요." };
  }

  return { ready: true, message: "발행 준비됨" };
}

export function hasContentStudioDraft({ mode, title, body, slides = [] } = {}) {
  if (mode === "carousel") {
    return slides.some((slide) => hasText(slide?.title) || hasText(slide?.sub));
  }
  return hasText(title) || hasText(body);
}
