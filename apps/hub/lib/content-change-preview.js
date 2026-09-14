// A linear comparison keeps large drafts responsive. It highlights the span
// between the first and last change; unchanged text inside that span stays in it.
export function contentChangePreview(before, after) {
  const left = Array.from(before), right = Array.from(after);
  let start = 0, end = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  while (end < left.length - start && end < right.length - start && left[left.length - 1 - end] === right[right.length - 1 - end]) end += 1;
  const parts = chars => ({ prefix: chars.slice(0, start).join(''), changed: chars.slice(start, chars.length - end).join(''), suffix: end ? chars.slice(-end).join('') : '' });
  return { before: parts(left), after: parts(right), unchanged: before === after };
}
