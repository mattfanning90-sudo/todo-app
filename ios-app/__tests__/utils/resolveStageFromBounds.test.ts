// ios-app/__tests__/utils/resolveStageFromBounds.test.ts
import { resolveStageFromBounds, type StageBounds } from '../../src/utils/resolveStageFromBounds';
import type { Stage } from '../../src/api/types';

const bounds = new Map<Stage, StageBounds>([
  ['backlog',     { top: 0,   bottom: 300 }],
  ['in_progress', { top: 300, bottom: 600 }],
  ['done',        { top: 600, bottom: 900 }],
]);

test('returns backlog for Y within backlog bounds', () => {
  expect(resolveStageFromBounds(150, bounds)).toBe('backlog');
});

test('returns in_progress for Y within in_progress bounds', () => {
  expect(resolveStageFromBounds(400, bounds)).toBe('in_progress');
});

test('returns done for Y within done bounds', () => {
  expect(resolveStageFromBounds(750, bounds)).toBe('done');
});

test('returns null for Y above all bounds', () => {
  expect(resolveStageFromBounds(-10, bounds)).toBeNull();
});

test('returns null for Y below all bounds', () => {
  expect(resolveStageFromBounds(1000, bounds)).toBeNull();
});

test('boundary: Y equal to top is inside the stage', () => {
  expect(resolveStageFromBounds(300, bounds)).toBe('in_progress');
});

test('boundary: Y equal to stage bottom resolves to the next stage, not the current one', () => {
  expect(resolveStageFromBounds(600, bounds)).toBe('done');
});
