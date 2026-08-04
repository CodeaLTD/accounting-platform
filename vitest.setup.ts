import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// @tanstack/react-virtual (used by DeclarationTable) measures its scroll
// container's real pixel size via getBoundingClientRect and
// ResizeObserver to decide which rows are "in view" — jsdom implements
// neither with real layout. restoreAllMocks() runs first so each test
// starts from a clean slate before this default is re-applied; a test
// that needs a smaller mocked viewport (to assert virtualization itself)
// can call vi.spyOn(Element.prototype, "getBoundingClientRect") again
// within its own body to override this default for just that test.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const DEFAULT_MOCK_RECT: DOMRect = {
  width: 1000,
  height: 800,
  top: 0,
  left: 0,
  bottom: 800,
  right: 1000,
  x: 0,
  y: 0,
  toJSON: () => {},
};

// The installed @tanstack/virtual-core (3.17.7, pulled in transitively by
// @tanstack/react-virtual) measures its scroll container via
// `element.offsetWidth`/`offsetHeight`, not `getBoundingClientRect` —
// jsdom hardcodes both to 0 with no way to override them directly (they're
// non-configurable getters on HTMLElement.prototype in real browsers, and
// jsdom never implements real layout for them either). Redefine them here
// to delegate to the same (mockable) getBoundingClientRect above, so a
// test overriding getBoundingClientRect — the officially documented
// react-virtual testing approach — also drives the container size this
// virtual-core version actually reads.
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get() {
    return this.getBoundingClientRect().width;
  },
});
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get() {
    return this.getBoundingClientRect().height;
  },
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    DEFAULT_MOCK_RECT,
  );
});

afterEach(() => cleanup());
