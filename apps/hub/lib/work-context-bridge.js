import {
  WORK_CONTEXTS,
  resolveWorkContext,
  scopeMappedItemsByWorkContext,
} from "@/lib/dashboard-contexts";

export function getVisibleWorkContexts(selectedContextValue = "all") {
  if (selectedContextValue && selectedContextValue !== "all") {
    return [resolveWorkContext(selectedContextValue)];
  }

  return WORK_CONTEXTS.filter((item) => item.value !== "all");
}

export function scopeStrictWorkItems(items, contextValue, selector) {
  if (contextValue === "all") {
    return items || [];
  }

  const scoped = scopeMappedItemsByWorkContext(items || [], contextValue, selector);
  return scoped.isFallback ? [] : scoped.items;
}

export function buildWorkContextHref(path, contextValue) {
  const [pathname, query = ""] = String(path || "").split("?");
  const params = new URLSearchParams(query);

  if (contextValue && contextValue !== "all") {
    params.set("project", contextValue);
  } else {
    params.delete("project");
  }

  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function sumWorkValues(values) {
  return (values || []).reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

export function averageWorkValues(values) {
  const source = (values || []).filter((value) => Number.isFinite(value));

  if (!source.length) {
    return 0;
  }

  return Math.round(source.reduce((total, value) => total + value, 0) / source.length);
}

export function formatWorkMetric(value, { pad = true } = {}) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return pad ? String(safeValue).padStart(2, "0") : String(safeValue);
}
