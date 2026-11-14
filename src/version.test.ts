import { describe, expect, it } from "vitest";
import { abzeichenFuer, istVorabversion } from "./version";

describe("abzeichenFuer", () => {
  it("zeigt bei einer Vorabversion den Kanal statt des Stadiums", () => {
    expect(abzeichenFuer("0.31.0-pre.2", "Beta", "Vorab")).toBe("Vorab");
    expect(abzeichenFuer("1.0.0-pre", "Beta", "Vorab")).toBe("Vorab");
  });

  it("zeigt bei einer fertigen Fassung das Stadium", () => {
    expect(abzeichenFuer("0.31.0", "Beta", "Vorab")).toBe("Beta");
  });

  it("raet kein Abzeichen aus einem fremden Suffix", () => {
    expect(abzeichenFuer("0.31.0-rc.1", "Beta", "Vorab")).toBe("Beta");
    expect(abzeichenFuer("0.31.0-preview", "Beta", "Vorab")).toBe("Beta");
    // Die alten Vorabversionen hiessen so; als Kanal gelten sie nicht mehr.
    expect(istVorabversion("0.30.0-beta.6")).toBe(false);
  });
});
