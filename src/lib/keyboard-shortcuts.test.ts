import { describe, expect, it, vi } from "vitest";
import { submitOnModEnter } from "./keyboard-shortcuts";

function fakeEvent(overrides: { metaKey?: boolean; ctrlKey?: boolean; key?: string } = {}) {
  const requestSubmit = vi.fn();
  const preventDefault = vi.fn();
  const event = {
    metaKey: false,
    ctrlKey: false,
    key: "Enter",
    ...overrides,
    preventDefault,
    currentTarget: { form: { requestSubmit } },
  };
  return { event: event as never, requestSubmit, preventDefault };
}

describe("submitOnModEnter", () => {
  it("Cmd(meta)+Enterでフォームをsubmitする", () => {
    const { event, requestSubmit, preventDefault } = fakeEvent({ metaKey: true });
    submitOnModEnter(event);
    expect(preventDefault).toHaveBeenCalled();
    expect(requestSubmit).toHaveBeenCalled();
  });

  it("Ctrl+Enterでもフォームをsubmitする", () => {
    const { event, requestSubmit } = fakeEvent({ ctrlKey: true });
    submitOnModEnter(event);
    expect(requestSubmit).toHaveBeenCalled();
  });

  it("修飾キー無しのEnterでは何もしない", () => {
    const { event, requestSubmit, preventDefault } = fakeEvent({});
    submitOnModEnter(event);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(requestSubmit).not.toHaveBeenCalled();
  });

  it("Cmd/Ctrlを押していてもEnter以外のキーでは何もしない", () => {
    const { event, requestSubmit } = fakeEvent({ metaKey: true, key: "a" });
    submitOnModEnter(event);
    expect(requestSubmit).not.toHaveBeenCalled();
  });
});
