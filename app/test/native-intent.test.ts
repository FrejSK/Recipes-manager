import { redirectSystemPath } from '../app/+native-intent';

describe('redirectSystemPath', () => {
  it('redirects share-intent deep links to the root', () => {
    expect(redirectSystemPath({ path: 'recepty://dataUrl=receptyShareKey', initial: true })).toBe('/');
  });
  it('keeps other paths unchanged', () => {
    expect(redirectSystemPath({ path: '/recipe/1', initial: false })).toBe('/recipe/1');
  });
});
