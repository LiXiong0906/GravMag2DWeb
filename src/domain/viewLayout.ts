export const PLOT_GUTTER_LEFT_CSS = 58;
export const PLOT_GUTTER_RIGHT_CSS = 58;
export const PLOT_X_TICK_INTERVAL_METERS = 400;

export function createPlotXTicks(minX: number, maxX: number, interval = PLOT_X_TICK_INTERVAL_METERS) {
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || interval <= 0 || minX > maxX) {
    return [];
  }

  const ticks: number[] = [];
  const start = Math.ceil(minX / interval) * interval;
  const end = Math.floor(maxX / interval) * interval;

  for (let value = start; value <= end; value += interval) {
    ticks.push(Object.is(value, -0) ? 0 : value);
  }

  return ticks;
}
