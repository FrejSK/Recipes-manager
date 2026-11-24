import { prepareImages } from '../src/import/prepare-images';

type Rect = { originX: number; originY: number; width: number; height: number };
type Call = { source: string; crops: Rect[]; resizes: { width?: number | null; height?: number | null }[] };

// Fake of the contextual ImageManipulator API that records what was asked of it.
const mockSizes: Record<string, { width: number; height: number }> = {};
const mockCalls: Call[] = [];
const mockSaves: unknown[] = [];
jest.mock('expo-image-manipulator', () => {
  const makeRef = (source: string, width: number, height: number, n: number) => ({
    __source: source,
    width,
    height,
    release: jest.fn(),
    saveAsync: jest.fn(async (o: unknown) => {
      mockSaves.push(o);
      return { uri: `file:///out-${n}.jpg`, width, height, base64: `b64-${n}` };
    }),
  });
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
    ImageManipulator: {
      manipulate: (src: string | { __source: string }) => {
        const source = typeof src === 'string' ? src : src.__source;
        const call: Call = { source, crops: [], resizes: [] };
        mockCalls.push(call);
        const ctx = {
          crop: (r: Rect) => {
            call.crops.push(r);
            return ctx;
          },
          resize: (s: { width?: number | null; height?: number | null }) => {
            call.resizes.push(s);
            return ctx;
          },
          release: jest.fn(),
          renderAsync: async () => {
            const size = mockSizes[source];
            return makeRef(source, size.width, size.height, mockCalls.length);
          },
        };
        return ctx;
      },
    },
  };
});

beforeEach(() => {
  mockCalls.length = 0;
  mockSaves.length = 0;
});

const cropCalls = () => mockCalls.filter((c) => c.crops.length > 0);

describe('prepareImages', () => {
  it('crops once per planned tile and resizes the long edge to at most 1568', async () => {
    mockSizes['file:///long.png'] = { width: 1000, height: 6000 }; // 3 tiles, each ~1000 x 2100
    mockSizes['file:///wide.png'] = { width: 2000, height: 1000 }; // 1 tile, wide
    mockSizes['file:///small.png'] = { width: 800, height: 600 }; // 1 tile, no resize

    const out = await prepareImages(['file:///long.png', 'file:///wide.png', 'file:///small.png']);

    expect(out).toHaveLength(5);
    out.forEach((img) => expect(img.mediaType).toBe('image/jpeg'));
    expect(new Set(out.map((o) => o.data)).size).toBe(5);

    const crops = cropCalls();
    expect(crops.map((c) => c.source)).toEqual([
      'file:///long.png',
      'file:///long.png',
      'file:///long.png',
      'file:///wide.png',
      'file:///small.png',
    ]);
    crops.forEach((c) => expect(c.crops).toHaveLength(1));
    expect(crops[0].crops[0]).toEqual({ originX: 0, originY: 0, width: 1000, height: 2100 });

    // Tall tiles are resized by height, wide by width, small not at all.
    expect(crops[0].resizes).toEqual([{ height: 1568 }]);
    expect(crops[3].resizes).toEqual([{ width: 1568 }]);
    expect(crops[4].resizes).toEqual([]);

    expect(mockSaves).toHaveLength(5);
    mockSaves.forEach((s) => expect(s).toEqual({ format: 'jpeg', compress: 0.8, base64: true }));
  });

  it('throws image_too_long for an extremely long image', async () => {
    mockSizes['file:///scroll.png'] = { width: 100, height: 100000 };
    await expect(prepareImages(['file:///scroll.png'])).rejects.toThrow('image_too_long');
  });
});
