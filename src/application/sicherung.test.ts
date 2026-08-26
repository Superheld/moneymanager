import { describe, expect, it } from "vitest";
import { sicherungPflegen, type SicherungPort } from "./sicherung";

/** Ein Port, der sich merkt, was mit ihm geschah. */
function fakePort(vorhanden: string[] = []) {
  const stand = new Set(vorhanden);
  const protokoll: string[] = [];
  const port: SicherungPort = {
    async anlegen(stichtag) {
      protokoll.push(`anlegen:${stichtag}`);
      if (stand.has(stichtag)) return false;
      stand.add(stichtag);
      return true;
    },
    async auflisten() {
      protokoll.push("auflisten");
      return [...stand];
    },
    async entfernen(stichtage) {
      protokoll.push(`entfernen:${stichtage.join(",")}`);
      for (const s of stichtage) stand.delete(s);
      return stichtage.length;
    },
  };
  return { port, stand, protokoll };
}

describe("Sicherungen pflegen", () => {
  it("legt an, wenn für den Tag noch nichts da ist", async () => {
    const { port, stand } = fakePort();
    const lauf = await sicherungPflegen(port, "2026-08-26");

    expect(lauf.angelegt).toBe(true);
    expect(stand.has("2026-08-26")).toBe(true);
  });

  it("legt nicht zweimal am selben Tag an", async () => {
    const { port } = fakePort(["2026-08-26"]);
    const lauf = await sicherungPflegen(port, "2026-08-26");

    expect(lauf.angelegt).toBe(false);
  });

  it("sichert ZUERST und räumt danach auf", async () => {
    const { port, protokoll } = fakePort();
    await sicherungPflegen(port, "2026-08-26");

    // Andersherum könnte ein Fehler beim Anlegen einen Stand hinterlassen, in dem die
    // älteste Sicherung weg ist und keine neue dazukam.
    expect(protokoll[0]).toBe("anlegen:2026-08-26");
    expect(protokoll.indexOf("auflisten")).toBeGreaterThan(0);
  });

  it("räumt nicht auf, wenn es nichts aufzuräumen gibt", async () => {
    const { port, protokoll } = fakePort(["2026-08-25"]);
    const lauf = await sicherungPflegen(port, "2026-08-26");

    expect(lauf.entfernt).toBe(0);
    expect(protokoll.some((z) => z.startsWith("entfernen"))).toBe(false);
  });

  it("dünnt aus, was die Staffelung nicht mehr hält", async () => {
    // Eine tägliche Reihe über gut zwei Wochen — mehr, als die Tagesstufe hält.
    const reihe: string[] = [];
    for (let tag = 1; tag <= 20; tag++) reihe.push(`2026-08-${String(tag).padStart(2, "0")}`);

    const { port, stand } = fakePort(reihe);
    const lauf = await sicherungPflegen(port, "2026-08-21");

    expect(lauf.angelegt).toBe(true);
    expect(lauf.entfernt).toBeGreaterThan(0);
    expect(stand.size).toBeLessThan(reihe.length);
    // Der frische Stand bleibt in jedem Fall.
    expect(stand.has("2026-08-21")).toBe(true);
  });

  it("hält sich an eine mitgegebene Regel", async () => {
    const { port, stand } = fakePort(["2026-08-24", "2026-08-25"]);
    await sicherungPflegen(port, "2026-08-26", {
      taeglich: 1, woechentlich: 0, monatlich: 0, jaehrlich: 0,
    });

    expect([...stand]).toEqual(["2026-08-26"]);
  });
});
