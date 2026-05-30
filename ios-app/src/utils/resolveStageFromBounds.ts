// ios-app/src/utils/resolveStageFromBounds.ts
import type { Stage } from '@/api/types';

export type StageBounds = { top: number; bottom: number };

/**
 * Given a Y coordinate (in content space) and a map of stage → {top, bottom},
 * returns the Stage whose bounds contain Y, or null if Y is outside all bounds.
 * The bottom boundary is exclusive: top <= Y < bottom.
 */
export function resolveStageFromBounds(
  y: number,
  bounds: Map<Stage, StageBounds>
): Stage | null {
  for (const [stage, { top, bottom }] of bounds) {
    if (y >= top && y < bottom) return stage;
  }
  return null;
}
