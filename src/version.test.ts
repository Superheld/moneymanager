import { describe, expect, it } from "vitest";
import { abzeichenFuer } from "./version";

describe("abzeichenFuer", () => {
  it("zeigt bei einer Beta den Kanal statt des Stadiums", () => {
    expect(abzeichenFuer("0.30.0-beta.2", "Alpha")).toBe("Beta");
    expect(abzeichenFuer("1.0.0-beta", "Alpha")).toBe("Beta");
  });

  it("zeigt bei einer fertigen Fassung das Stadium", () => {
    expect(abzeichenFuer("0.30.0", "Alpha")).toBe("Alpha");
  });

  it("raet kein Abzeichen aus einem fremden Suffix", () => {
    expect(abzeichenFuer("0.30.0-rc.1", "Alpha")).toBe("Alpha");
    expect(abzeichenFuer("0.30.0-betamax", "Alpha")).toBe("Alpha");
  });
});
