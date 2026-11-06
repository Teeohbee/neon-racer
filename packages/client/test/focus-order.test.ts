import { describe, expect, it } from "vitest";
import { navDir, nextFocus, type Box } from "../src/shell/focus-order";

const box = (x: number, y: number, w = 100, h = 30): Box => ({ x, y, w, h });

const stack = [box(0, 0, 200), box(0, 40, 200), box(0, 80, 200)];
const lobby = [box(0, 0), box(110, 0), box(0, 40), box(110, 40), box(300, 0, 200), box(300, 40, 200)];

describe("navDir", () => {
  it("maps arrow keys and ignores the rest", () => {
    expect(navDir("ArrowDown")).toBe("down");
    expect(navDir("ArrowLeft")).toBe("left");
    expect(navDir("Enter")).toBeNull();
    expect(navDir("s")).toBeNull();
  });
});

describe("nextFocus", () => {
  it("steps down and up a vertical stack", () => {
    expect(nextFocus(stack, 0, "down")).toBe(1);
    expect(nextFocus(stack, 2, "up")).toBe(1);
  });

  it("wraps vertically past either end", () => {
    expect(nextFocus(stack, 2, "down")).toBe(0);
    expect(nextFocus(stack, 0, "up")).toBe(2);
  });

  it("stays put sideways when nothing is there", () => {
    expect(nextFocus(stack, 1, "left")).toBe(1);
    expect(nextFocus(stack, 1, "right")).toBe(1);
  });

  it("moves along a row before crossing into the next column", () => {
    expect(nextFocus(lobby, 0, "right")).toBe(1);
    expect(nextFocus(lobby, 1, "right")).toBe(4);
    expect(nextFocus(lobby, 4, "left")).toBe(1);
  });

  it("keeps the same column when moving between rows", () => {
    expect(nextFocus(lobby, 1, "down")).toBe(3);
    expect(nextFocus(lobby, 5, "up")).toBe(4);
  });

  it("starts at the first item going forward and the last going back when nothing is focused", () => {
    expect(nextFocus(stack, -1, "down")).toBe(0);
    expect(nextFocus(stack, -1, "up")).toBe(2);
  });

  it("returns -1 when there is nothing to focus", () => {
    expect(nextFocus([], -1, "down")).toBe(-1);
  });
});
