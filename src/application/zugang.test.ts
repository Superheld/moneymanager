import { describe, expect, it } from "vitest";
import { MINDESTLAENGE } from "../core/zugang/passphrase";
import { mitCodeRetten, passphraseWechseln, zugangEinrichten, type ZugangPort } from "./zugang";

const LANG = "eine lange Passphrase";

function fakePort(überschreiben: Partial<ZugangPort> = {}) {
  const gerufen: string[] = [];
  const port: ZugangPort = {
    stand: async () => ({ eingerichtet: false, offen: false, altbestand: false }),
    einrichten: async () => {
      gerufen.push("einrichten");
      return "ABCD-EFGH";
    },
    entsperren: async () => true,
    mitCode: async () => {
      gerufen.push("mitCode");
      return true;
    },
    passphraseWechseln: async () => {
      gerufen.push("wechseln");
      return true;
    },
    codeZeigen: async () => "ABCD-EFGH",
    sperren: async () => {},
    ...überschreiben,
  };
  return { port, gerufen };
}

describe("Zugang einrichten", () => {
  it("gibt den Wiederherstellungscode zurück", async () => {
    const { port } = fakePort();
    expect(await zugangEinrichten(port, LANG)).toEqual({
      art: "fertig",
      wiederherstellungscode: "ABCD-EFGH",
    });
  });

  it("weist eine zu kurze Passphrase ab, OHNE den Port zu rufen", async () => {
    const { port, gerufen } = fakePort();
    const ergebnis = await zugangEinrichten(port, "kurz");

    expect(ergebnis.art).toBe("abgelehnt");
    // Der Punkt: eine abgelehnte Passphrase darf gar nicht erst zu einer Hülle führen.
    expect(gerufen).toEqual([]);
  });

  it("nennt beim Ablehnen, wie viel fehlt", async () => {
    const { port } = fakePort();
    const ergebnis = await zugangEinrichten(port, "abc");
    expect(ergebnis).toEqual({
      art: "abgelehnt",
      befund: { taugt: false, grund: "zuKurz", fehlt: MINDESTLAENGE - 3 },
    });
  });
});

describe("Passphrase wechseln", () => {
  it("wechselt", async () => {
    const { port } = fakePort();
    expect(await passphraseWechseln(port, "alt genug hier", LANG)).toEqual({ art: "fertig" });
  });

  it("meldet eine falsche alte Passphrase", async () => {
    const { port } = fakePort({ passphraseWechseln: async () => false });
    expect(await passphraseWechseln(port, "falsch aber lang", LANG)).toEqual({ art: "alteFalsch" });
  });

  it("prüft die NEUE Passphrase, bevor irgendetwas passiert", async () => {
    const { port, gerufen } = fakePort();
    const ergebnis = await passphraseWechseln(port, "alt genug hier", "kurz");

    expect(ergebnis.art).toBe("abgelehnt");
    expect(gerufen).toEqual([]);
  });
});

describe("Mit dem Wiederherstellungscode retten", () => {
  it("rettet und setzt dabei die neue Passphrase", async () => {
    const { port } = fakePort();
    expect(await mitCodeRetten(port, "ABCD-EFGH", LANG)).toEqual({ art: "fertig" });
  });

  it("meldet einen unbrauchbaren Code", async () => {
    const { port } = fakePort({ mitCode: async () => false });
    expect(await mitCodeRetten(port, "murks", LANG)).toEqual({ art: "codeUnbrauchbar" });
  });

  it("verlangt auch hier eine taugliche neue Passphrase", async () => {
    // Sonst führte der Rettungsweg an der Regel vorbei — und wer den Zettel braucht, ist
    // in Eile.
    const { port, gerufen } = fakePort();
    expect((await mitCodeRetten(port, "ABCD-EFGH", "kurz")).art).toBe("abgelehnt");
    expect(gerufen).toEqual([]);
  });
});
