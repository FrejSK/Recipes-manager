/** @jest-environment node */
// In-memory fake file system: a set of existing file URIs plus recorded calls.
const mockFiles = new Set<string>();
const mockDel = jest.fn();
const mockMove = jest.fn();
const mockDownload = jest.fn(async (_url: string, dest: { uri: string }) => {
  mockFiles.add(dest.uri);
});
const mockDirCreate = jest.fn();

// Fake ImageManipulator: sources map to image sizes; records resizes, saves and releases.
const mockSizes: Record<string, { width: number; height: number }> = {};
const mockResizes: { width?: number | null; height?: number | null }[] = [];
const mockSaves: unknown[] = [];
const mockReleases = { count: 0, created: 0 };
let mockLoadError: Error | null = null;
let mockOutN = 0;

let mockUuidN = 0;
jest.mock('../src/util/uuid', () => ({
  randomUUID: () => `123e4567-e89b-12d3-a456-42661417400${mockUuidN++}`,
}));
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    exists = false;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    create(opts?: unknown) {
      mockDirCreate(opts);
    }
  }
  class File {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    async move(dest: { uri: string }) {
      mockMove(this.uri, dest.uri);
      mockFiles.delete(this.uri);
      mockFiles.add(dest.uri);
      this.uri = dest.uri;
    }
    delete() {
      mockDel(this.uri);
      mockFiles.delete(this.uri);
    }
    static downloadFileAsync = (url: string, dest: { uri: string }) => mockDownload(url, dest);
  }
  return {
    File,
    Directory,
    Paths: { document: new Directory('file:///docs'), cache: new Directory('file:///cache') },
  };
});
jest.mock('expo-image-manipulator', () => {
  const releasable = () => {
    mockReleases.created++;
    return { release: () => mockReleases.count++ };
  };
  const makeRef = (width: number, height: number) => ({
    ...releasable(),
    width,
    height,
    saveAsync: async (o: unknown) => {
      mockSaves.push(o);
      const uri = `file:///cache/ImageManipulator/out-${++mockOutN}.jpg`;
      mockFiles.add(uri);
      return { uri, width, height };
    },
  });
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
    ImageManipulator: {
      manipulate: (src: string | { width: number; height: number }) => {
        let size = typeof src === 'string' ? mockSizes[src] : { width: src.width, height: src.height };
        const ctx = {
          ...releasable(),
          resize: (s: { width?: number | null; height?: number | null }) => {
            mockResizes.push(s);
            const w = s.width!;
            size = { width: w, height: Math.round((size.height * w) / size.width) };
            return ctx;
          },
          renderAsync: async () => {
            if (mockLoadError) throw mockLoadError;
            return makeRef(size.width, size.height);
          },
        };
        return ctx;
      },
    },
  };
});

import { deleteImages, imageUri, saveImage } from '../src/files/images';
import { IMAGE_PATH_RE } from '../src/backup/format';

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockResizes.length = 0;
  mockSaves.length = 0;
  mockReleases.count = 0;
  mockReleases.created = 0;
  mockLoadError = null;
  mockSizes['file:///tmp/wide.png'] = { width: 4000, height: 3000 };
  mockSizes['file:///tmp/narrow.jpg'] = { width: 1080, height: 6000 };
});

describe('saveImage', () => {
  it('shrinks a wide image to 1440 px width and stores it as images/<uuid>.jpg', async () => {
    const rel = await saveImage('file:///tmp/wide.png');
    expect(rel).toMatch(IMAGE_PATH_RE);
    expect(rel).toMatch(/^images\/[0-9a-f-]+\.jpg$/);
    expect(mockResizes).toEqual([{ width: 1440 }]);
    expect(mockSaves).toEqual([{ format: 'jpeg', compress: 0.8 }]);
    expect(mockMove).toHaveBeenCalledWith(expect.stringMatching(/^file:\/\/\/cache\//), `file:///docs/${rel}`);
    expect([...mockFiles]).toEqual([`file:///docs/${rel}`]);
    expect(mockDirCreate).toHaveBeenCalled();
    expect(mockReleases.count).toBe(mockReleases.created);
  });

  it('does not resize a narrow (long) screenshot, but still re-encodes it as JPEG 0.8', async () => {
    const rel = await saveImage('file:///tmp/narrow.jpg');
    expect(mockResizes).toEqual([]);
    expect(mockSaves).toEqual([{ format: 'jpeg', compress: 0.8 }]);
    expect([...mockFiles]).toEqual([`file:///docs/${rel}`]);
    expect(mockReleases.count).toBe(mockReleases.created);
  });

  it('downloads http(s) URLs to a cache temp file, processes it and deletes the temp file', async () => {
    const remote = 'https://x.sk/a.jpg';
    mockDownload.mockImplementationOnce(async (_url, dest) => {
      mockFiles.add(dest.uri);
      mockSizes[dest.uri] = { width: 2000, height: 1000 };
    });
    const rel = await saveImage(remote);
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload.mock.calls[0][0]).toBe(remote);
    const temp = mockDownload.mock.calls[0][1].uri;
    expect(temp).toMatch(/^file:\/\/\/cache\//);
    expect(mockResizes).toEqual([{ width: 1440 }]);
    expect(mockDel).toHaveBeenCalledWith(temp);
    expect([...mockFiles]).toEqual([`file:///docs/${rel}`]);
  });

  it('rejects when the image cannot be read and leaves no file behind', async () => {
    mockLoadError = new Error('load failed');
    await expect(saveImage('file:///tmp/wide.png')).rejects.toThrow('load failed');
    expect(mockFiles.size).toBe(0);
    expect(mockReleases.count).toBe(mockReleases.created);
  });

  it('rejects when moving the encoded file fails and deletes the partial output', async () => {
    mockMove.mockImplementationOnce(() => {
      throw new Error('move failed');
    });
    await expect(saveImage('file:///tmp/wide.png')).rejects.toThrow('move failed');
    expect(mockFiles.size).toBe(0);
    expect(mockReleases.count).toBe(mockReleases.created);
  });

  it('rejects when the download fails and removes the temp file', async () => {
    mockDownload.mockImplementationOnce(async (_url, dest) => {
      mockFiles.add(dest.uri);
      throw new Error('offline');
    });
    await expect(saveImage('https://x.sk/a.jpg')).rejects.toThrow('offline');
    expect(mockFiles.size).toBe(0);
  });
});

describe('images', () => {
  it('imageUri resolves relative path under the document directory', () => {
    expect(imageUri('images/a.jpg')).toBe('file:///docs/images/a.jpg');
  });

  it('deleteImages deletes existing files and ignores null and missing', async () => {
    mockFiles.add('file:///docs/images/a.jpg');
    await deleteImages([null, 'images/a.jpg', 'images/missing.jpg']);
    expect(mockDel).toHaveBeenCalledTimes(1);
    expect(mockDel).toHaveBeenCalledWith('file:///docs/images/a.jpg');
  });
});
