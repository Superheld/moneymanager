// useRegisterfilter — was vom gebuchten Register eines Kontos gerade zu sehen ist: Suche,
// Art, Kategorie und „nur mögliche Dubletten".
//
// Herausgezogen aus `KontenScreen` (2026-11-10, K2 der Oberflächenliste): der Screen trug
// 24 Zustände in einer Funktion von rund 800 Zeilen, und die vier Filter samt ihrer
// Rechnung waren ein geschlossenes Thema darin — sie lesen das Register und liefern eine
// Teilmenge, sonst nichts. Das Verhalten ist unverändert.

import { useEffect, useMemo, useState } from "react";
import type { Geld } from "../bausteine/einstellungenKontext";
import type { Registersicht } from "../../../application";

export type Artfilter = "alle" | "einnahmen" | "ausgaben" | "umbuchung";

type Zeile = Registersicht["gebucht"][number];

export function useRegisterfilter({
  register,
  kategorieName,
  geld,
  kontoId,
}: {
  register: Registersicht | null;
  kategorieName: ReadonlyMap<string, string>;
  geld: Geld;
  /** Wechselt das Konto, fangen die Filter von vorn an. */
  kontoId: string;
}) {
  const [katFilter, setKatFilter] = useState("alle");
  const [artFilter, setArtFilter] = useState<Artfilter>("alle");
  const [regSuche, setRegSuche] = useState("");
  /**
   * Nur die Zeilen zeigen, die womöglich doppelt im Konto stehen.
   *
   * Seit der Abruf direkt bucht, gibt es keine Vorstufe mehr, in der ein Zwilling
   * auffiele — die Frage „steht das schon drin?" gehört deshalb an den Auszug selbst.
   */
  const [nurDubletten, setNurDubletten] = useState(false);

  // Beim Kontowechsel die Filter zurücksetzen.
  useEffect(() => {
    setKatFilter("alle");
    setArtFilter("alle");
    setRegSuche("");
    setNurDubletten(false);
  }, [kontoId]);

  // Kategorien, die im gebuchten Register wirklich vorkommen (für das Filter-Dropdown).
  const kategorienImRegister = useMemo(() => {
    const ids = new Set<string>();
    for (const z of register?.gebucht ?? []) if (z.zeile.kategorieId) ids.add(z.zeile.kategorieId);
    return [...ids].map((id) => ({ id, name: kategorieName.get(id) ?? "?" })).sort((a, b) => a.name.localeCompare(b.name));
  }, [register, kategorieName]);

  const gefiltert = useMemo((): Zeile[] => {
    const q = regSuche.trim().toLowerCase();
    // „12,50" soll die Zeile über 12,50 € finden, egal ob sie ein Zu- oder Abfluss ist.
    // Zwei Wege nebeneinander, weil beide gebraucht werden: der geparste Betrag trifft
    // exakt (auch „12" → 12,00), der formatierte Text erlaubt das Suchen nach Anfängen
    // („1.2" findet 1.234,56). Nur der Text allein hätte „12" nie auf 12,00 gebracht.
    const qBetrag = regSuche.trim() ? geld.parse(regSuche.trim()) : null;
    return (register?.gebucht ?? []).filter((r) => {
      const z = r.zeile;
      if (nurDubletten && !r.dublette) return false;
      if (katFilter === "__ohne" ? !!z.kategorieId : katFilter !== "alle" && z.kategorieId !== katFilter) return false;
      if (artFilter === "umbuchung" && !z.gegenkontoId) return false;
      if (artFilter === "einnahmen" && !(z.betrag > 0 && !z.gegenkontoId)) return false;
      if (artFilter === "ausgaben" && !(z.betrag < 0 && !z.gegenkontoId)) return false;
      if (q) {
        const heu = `${r.bezeichnung} ${r.verwendungszweck} ${r.kategorieName} ${geld.format(Math.abs(z.betrag))}`.toLowerCase();
        const trifftBetrag = qBetrag != null && Math.abs(z.betrag) === Math.abs(qBetrag);
        if (!heu.includes(q) && !trifftBetrag) return false;
      }
      return true;
    });
  }, [register, katFilter, artFilter, regSuche, nurDubletten, geld]);

  /** Wie viele Zeilen des Registers überhaupt einen Verdacht tragen. */
  const dublettenAnzahl = useMemo(() => (register?.gebucht ?? []).filter((r) => r.dublette).length, [register]);

  // Ist der letzte Verdacht erledigt, verschwindet der Filterknopf — der Filter selbst
  // blieb bisher an und liess eine leere Tabelle zurück, ohne dass noch etwas dastand,
  // womit man ihn wieder ausschaltet. Der Erfolg sah aus wie ein Datenverlust.
  useEffect(() => {
    if (dublettenAnzahl === 0) setNurDubletten(false);
  }, [dublettenAnzahl]);

  return {
    katFilter, setKatFilter,
    artFilter, setArtFilter,
    regSuche, setRegSuche,
    nurDubletten, setNurDubletten,
    kategorienImRegister,
    gefiltert,
    dublettenAnzahl,
  };
}
