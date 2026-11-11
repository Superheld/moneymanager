// useGegenbeinwahl — wo die zweite Seite einer Umschichtung im Entwurf steckt.
//
// Herausgezogen aus `BuchungFormular` (2026-11-10, K1 der Oberflächenliste): Kandidaten,
// Wahl und das Konto für ein neues Bein sind ein eigenes Thema, das nur Konto, Entwurf
// und Charakter von aussen braucht. Das Verhalten ist unverändert.
//
// Eine Umschichtung hat zwei Seiten, und die zweite liegt auf einem anderen Konto. Wo sie
// steckt, ist offen: sie kann als zweiter Entwurf danebenliegen, längst gebucht sein (das
// andere Bein kam mit einem früheren Abruf), gar nicht existieren (Bargeld wird nicht
// importiert) — oder es ist wirklich nur eine Seite.
//
// ZWEI Zeitfenster, und das ist kein Versehen: Entwürfe werden beim Übernehmen von
// `paareUmbuchungen` verknüpft, und die Regel dort erlaubt 3 Tage. Ein weiter entfernter
// Entwurf liesse sich hier auswählen, würde beim Verbuchen aber nicht gepaart — zwei halbe
// Umschichtungen. Bei gebuchten Zeilen paart `buchungenPaaren` auf Zuruf, ohne Fenster; da
// gilt das grosszügigere Vorschlags-Fenster wie im Umbuchungs-Dialog.

import { useMemo, useState } from "react";
import { istAktiv, type IstBuchung, type Zahlungskonto } from "../../../application";
import { passtAlsGegenbein, type Umsatz } from "../../../application/import";
import { paarungsKandidaten } from "../../../application/buchung/umbuchungAusBuchung";

/** Auswahlwerte: `e:<id>` Entwurf, `b:<id>` gebucht, `__neu` erzeugen, `__einseitig`. */
export type Gegenbeinwahl = string;

export function useGegenbeinwahl({
  aktiv,
  entwurf,
  kontoId,
  konten,
  onlineKonten,
  andereEntwuerfe,
  alleBuchungen,
}: {
  /** Nur im Entwurf einer Umschichtung wird überhaupt gesucht. */
  aktiv: boolean;
  entwurf: Umsatz | undefined;
  kontoId: string;
  konten: readonly Zahlungskonto[];
  onlineKonten: ReadonlySet<string>;
  andereEntwuerfe: readonly Umsatz[];
  alleBuchungen: readonly IstBuchung[];
}) {
  /**
   * Konten, auf denen ein Gegenbein ERZEUGT werden darf.
   *
   * Nicht bloss „die anderen": auf einem abgerufenen Konto anzulegen hiesse, eine Buchung
   * zu erfinden, die es bei der Bank nicht gibt. Zwei abgerufene Konten brauchen das auch
   * gar nicht — beide Seiten meldet die Bank ohnehin, sie werden VERBUNDEN statt erzeugt.
   * Ein stillgelegtes Konto kommt nicht in Frage, und hier ohne Ausnahme: es wird ein
   * NEUES Bein erzeugt, es steht also nichts schon dran, das man stehenlassen müsste.
   */
  const andereKonten = konten.filter((k) => k.id !== kontoId && !onlineKonten.has(k.id) && istAktiv(k));

  const entwurfKandidaten = useMemo(
    () => (aktiv && entwurf ? andereEntwuerfe.filter((x) => passtAlsGegenbein({ ...entwurf, zahlungskontoId: kontoId }, x)) : []),
    [aktiv, andereEntwuerfe, entwurf, kontoId],
  );
  const buchungKandidaten = useMemo(
    () =>
      aktiv && entwurf
        ? paarungsKandidaten(alleBuchungen, {
            id: "", datum: entwurf.buchungstag, betrag: entwurf.betrag,
            kontoId, charakter: "Umschichtung", quelle: "import",
          })
        : [],
    [aktiv, alleBuchungen, entwurf, kontoId],
  );

  const optionen: Gegenbeinwahl[] = [
    ...entwurfKandidaten.map((x) => `e:${x.id}`),
    ...buchungKandidaten.map((x) => `b:${x.id}`),
    ...(andereKonten.length > 0 ? ["__neu"] : []),
    "__einseitig",
  ];
  const [wahl, setWahl] = useState<Gegenbeinwahl>("");
  // Leer starten und beim Lesen auffüllen: die Kontenliste wird asynchron nachgeladen,
  // ein useState-Initialwert liefe gegen die noch leere Liste und bliebe dann leer.
  const [neuKontoId, setNeuKontoId] = useState("");
  const neuKontoGewaehlt = andereKonten.some((k) => k.id === neuKontoId) ? neuKontoId : (andereKonten[0]?.id ?? "");
  // Das Konto zu wechseln ändert die Kandidatenliste. Statt die Wahl per Effekt
  // nachzuziehen (und dabei einen Render mit ungültigem Wert zu riskieren) wird sie beim
  // Lesen geprüft: was nicht mehr angeboten wird, fällt auf die beste Vorgabe zurück.
  const gewaehlt = optionen.includes(wahl) ? wahl : (optionen[0] ?? "__einseitig");

  return {
    andereKonten,
    entwurfKandidaten,
    buchungKandidaten,
    gewaehlt,
    waehlen: setWahl,
    neuKontoGewaehlt,
    neuKontoWaehlen: (id: string) => {
      setNeuKontoId(id);
      setWahl("__neu");
    },
  };
}
