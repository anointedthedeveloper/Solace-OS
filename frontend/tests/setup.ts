import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (typeof ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// jsdom's Blob/File can't survive fake-indexeddb's structured clone (real browsers can), so use Node's,
// which implement text()/arrayBuffer()/slice() natively.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
globalThis.File = NodeFile as unknown as typeof File;

// jsdom's FormData rejects Node's File/Blob (which we use above); a tiny stand-in is enough because the
// tests only append and read entries (the real browser FormData is used in production and e2e).
class TestFormData {
  private entriesList: Array<[string, unknown]> = [];
  append(name: string, value: unknown) {
    this.entriesList.push([name, value]);
  }
  get(name: string) {
    return this.entriesList.find(([n]) => n === name)?.[1] ?? null;
  }
  getAll(name: string) {
    return this.entriesList.filter(([n]) => n === name).map(([, v]) => v);
  }
  has(name: string) {
    return this.entriesList.some(([n]) => n === name);
  }
  entries() {
    return this.entriesList[Symbol.iterator]();
  }
}
globalThis.FormData = TestFormData as unknown as typeof FormData;
