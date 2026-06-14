import { lightTheme, darkTheme, radius } from '@/theme';

describe('Taskly theme contract', () => {
  it('uses the coral accent in both schemes', () => {
    expect(lightTheme.accent).toBe('#FF6B47');
    expect(darkTheme.accent).toBe('#FF6B47');
    expect(lightTheme.accentHover).toBe('#E8522E');
  });
  it('has warm Taskly surfaces, not the old blue-grey', () => {
    expect(lightTheme.bg).toBe('#F2F2F7');
    expect(lightTheme.text).toBe('#1E1E2E');
    expect(darkTheme.bg).toBe('#16161D');
  });
  it('has no blue leak in priority/stage', () => {
    expect(lightTheme.priority.high).toBe('#FF6B47');
    expect(lightTheme.priority.low).toBe('#9CA3AF');
    expect(lightTheme.stage.in_progress).toBe('#64748B');
  });
  it('exposes the new card radius and a pill radius', () => {
    expect(radius.card).toBe(16);
    expect(radius.pill).toBe(999);
  });
  it('no longer exposes a `tk` sub-palette', () => {
    expect((lightTheme as unknown as Record<string, unknown>).tk).toBeUndefined();
  });
});
