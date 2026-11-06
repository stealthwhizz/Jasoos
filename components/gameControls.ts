const MOVEMENT_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  w: [0, -1],
  s: [0, 1],
};

export function getGameKey(
  event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "isComposing">,
): string | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return Object.hasOwn(MOVEMENT_KEYS, key) || key === "e" ? key : null;
}

export function getMovementVector(keys: Iterable<string>): [number, number] {
  let deltaX = 0;
  let deltaY = 0;
  for (const key of new Set(keys)) {
    const [horizontal, vertical] = MOVEMENT_KEYS[key] ?? [0, 0];
    deltaX += horizontal;
    deltaY += vertical;
  }
  const magnitude = Math.hypot(deltaX, deltaY) || 1;
  return [deltaX / magnitude, deltaY / magnitude];
}
