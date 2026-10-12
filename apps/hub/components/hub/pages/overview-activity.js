// Count axes use whole, evenly spaced ticks with room for direct value labels.
export function activityAxis(maximum) {
  if (typeof maximum !== 'number' || !Number.isFinite(maximum) || maximum < 0) throw new RangeError('Activity maximum must be a known nonnegative count.');
  const rough = Math.max(1, maximum * 0.4);
  const unit = 10 ** Math.floor(Math.log10(rough));
  const multiple = [1, 2, 5, 10].find(value => value >= rough / unit);
  const step = multiple * unit;
  const max = Math.max(2 * step, Math.ceil(maximum * 1.2 / step) * step);
  return { max, step, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) };
}

// Four fixed labels at most; selection is read above the chart, so dates never
// crowd their neighbours. The beginning and end of the window always remain.
export function activityDateTicks(length) {
  if (length <= 0) return new Set();
  const step = length <= 7 ? 2 : length <= 14 ? 4 : Math.ceil(length / 3);
  return new Set([0, step, step * 2, length - 1].filter(index => index < length));
}
