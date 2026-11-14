import { describe, expect, it } from "vitest";
import { istVorabversion } from "./version";

describe("istVorabversion", () => {
  it("erkennt eine Vorabversion, mit und ohne Nummer", () => {
    expect(istVorabversion("0.31.0-pre.2")).toBe(true);
    expect(istVorabversion("1.0.0-pre")).toBe(true);
  });

  it("nimmt eine fertige Fassung nicht dafuer", () => {
    expect(istVorabversion("0.31.0")).toBe(false);
  });

  it("raet nicht aus einem fremden Suffix", () => {
    expect(istVorabversion("0.31.0-rc.1")).toBe(false);
    expect(istVorabversion("0.31.0-preview")).toBe(false);
    // Die alten Vorabversionen hiessen so; als Kanal gelten sie nicht mehr.
    expect(istVorabversion("0.30.0-beta.6")).toBe(false);
  });
});
