/** @jest-environment node */
const mockCopy = jest.fn();
const mockDel = jest.fn();
const mockDownload = jest.fn(async () => undefined);
const mockExisting = new Set<string>(['file:///docs/images/a.jpg']);
const mockDirCreate = jest.fn();

jest.mock('expo-crypto', () => ({ randomUUID: () => '123e4567-e89b-12d3-a456-426614174000' }));
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
      return mockExisting.has(this.uri);
    }
    async copy(dest: unknown) {
      mockCopy(this.uri, dest);
    }
    delete() {
      mockDel(this.uri);
    }
    static downloadFileAsync = (...args: unknown[]) => (mockDownload as any)(...args);
  }
  return { File, Directory, Paths: { document: new Directory('file:///docs') } };
});

import { deleteImages, imageUri, saveImage } from '../src/files/images';

beforeEach(() => jest.clearAllMocks());

describe('images', () => {
  it('copies file:// URIs into images/<uuid>.jpg', async () => {
    const rel = await saveImage('file:///tmp/a.jpg');
    expect(rel).toMatch(/^images\/[0-9a-f-]+\.jpg$/);
    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(mockCopy.mock.calls[0][0]).toBe('file:///tmp/a.jpg');
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockDirCreate).toHaveBeenCalled();
  });

  it('rejects when the copy fails', async () => {
    mockCopy.mockImplementationOnce(() => {
      throw new Error('copy failed');
    });
    await expect(saveImage('file:///tmp/a.jpg')).rejects.toThrow('copy failed');
  });

  it('downloads http(s) URLs', async () => {
    const rel = await saveImage('https://x.sk/a.jpg');
    expect(rel).toMatch(/^images\/[0-9a-f-]+\.jpg$/);
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect((mockDownload.mock.calls[0] as unknown[])[0]).toBe('https://x.sk/a.jpg');
    expect(mockCopy).not.toHaveBeenCalled();
  });

  it('imageUri resolves relative path under the document directory', () => {
    expect(imageUri('images/a.jpg')).toBe('file:///docs/images/a.jpg');
  });

  it('deleteImages deletes existing files and ignores null and missing', async () => {
    await deleteImages([null, 'images/a.jpg', 'images/missing.jpg']);
    expect(mockDel).toHaveBeenCalledTimes(1);
    expect(mockDel).toHaveBeenCalledWith('file:///docs/images/a.jpg');
  });
});
