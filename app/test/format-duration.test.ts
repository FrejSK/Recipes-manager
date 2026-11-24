import { formatDuration } from '../src/recipe/format-duration';

describe('formatDuration', () => {
  it('formats minutes under an hour', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(59)).toBe('59 min');
  });
  it('formats hours with remaining minutes', () => {
    expect(formatDuration(90)).toBe('1 h 30 min');
  });
  it('omits zero minutes', () => {
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(60)).toBe('1 h');
  });
});
