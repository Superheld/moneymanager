// useSammelauswahl — mehrere Zeilen einer Liste markieren, um sie zusammen zu bearbeiten.
//
// **Warum ein Baustein.** Bis 2026-11-10 stand dieselbe Mechanik zweimal von Hand da
// (Kontoauszug, Review-Inbox) — Modus, Menge, Umschalten, Alles-Markieren —, und die beiden
// Fassungen waren schon auseinandergelaufen: nur die Inbox warf beim Filterwechsel aus der
// Auswahl, was nicht mehr zu sehen war. Im Kontoauszug blieb es markiert. Wer dort nach
// einem Empfänger filterte, alles markierte, den Filter wechselte und dann „Auswahl
// bearbeiten" wählte, änderte auch Buchungen, die er nicht mehr vor Augen hatte.
//
// **Was nicht mehr sichtbar ist, ist nicht mehr gewählt.** Der Preis ist, dass ein
// Filterwechsel die Auswahl kostet; das ist der richtige Preis.
//
// **Alles-Markieren meint die GEFILTERTE Liste, nicht die sichtbare Seite.** Wer nach einem
// Empfänger filtert und alles markiert, meint alle seine Zeilen — nicht die ersten
// fünfundzwanzig davon. Deshalb kommen die ids vom Aufrufer und nicht aus der Tabelle.
//
// **Der Modus ist ein Schalter, kein Dauerzustand.** Eine dauerhafte Kästchenspalte macht
// aus einer Leseansicht ein Formular; sie erscheint erst, wenn man sie einschaltet, und
// beim Ausschalten ist die Auswahl weg.

import { useEffect, useState } from "react";

export interface Sammelauswahl {
  /** Ob die Kästchenspalte gerade da ist. */
  readonly modus: boolean;
  readonly modusSetzen: (an: boolean) => void;
  readonly auswahl: ReadonlySet<string>;
  readonly istGewaehlt: (id: string) => boolean;
  readonly umschalten: (id: string) => void;
  /** Alle gewählt? Dann leeren, sonst alle sichtbaren wählen. */
  readonly alleUmschalten: () => void;
  readonly alleGewaehlt: boolean;
  readonly leeren: () => void;
}

/**
 * @param sichtbareIds die ids der GEFILTERTEN Liste — als stabile Referenz (`useMemo`),
 *   sonst läuft das Ausdünnen bei jedem Rendern.
 */
export function useSammelauswahl(sichtbareIds: readonly string[]): Sammelauswahl {
  const [modus, setModus] = useState(false);
  const [auswahl, setAuswahl] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    setAuswahl((bisher) => {
      if (bisher.size === 0) return bisher;
      const sichtbar = new Set(sichtbareIds);
      const naechste = new Set([...bisher].filter((id) => sichtbar.has(id)));
      return naechste.size === bisher.size ? bisher : naechste;
    });
  }, [sichtbareIds]);

  const alleGewaehlt = sichtbareIds.length > 0 && sichtbareIds.every((id) => auswahl.has(id));

  return {
    modus,
    modusSetzen: (an) => {
      setModus(an);
      if (!an) setAuswahl(new Set());
    },
    auswahl,
    istGewaehlt: (id) => auswahl.has(id),
    umschalten: (id) =>
      setAuswahl((bisher) => {
        const neu = new Set(bisher);
        if (neu.has(id)) neu.delete(id);
        else neu.add(id);
        return neu;
      }),
    alleUmschalten: () => setAuswahl(alleGewaehlt ? new Set() : new Set(sichtbareIds)),
    alleGewaehlt,
    leeren: () => setAuswahl(new Set()),
  };
}
