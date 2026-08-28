import { describe, expect, it } from "vitest";
import { constrainBrowserBounds } from "./bounds";

describe("browser bounds policy", () => {
  it("keeps the native view inside the trusted window content", () => {
    expect(
      constrainBrowserBounds(
        { x: 200, y: 100, width: 2_000, height: 2_000 },
        { width: 1_200, height: 800 },
      ),
    ).toEqual({ x: 200, y: 100, width: 1_000, height: 700 });
  });

  it("rejects non-finite values", () => {
    expect(() =>
      constrainBrowserBounds(
        { x: Number.NaN, y: 0, width: 10, height: 10 },
        { width: 100, height: 100 },
      ),
    ).toThrow("finite");
  });
});
