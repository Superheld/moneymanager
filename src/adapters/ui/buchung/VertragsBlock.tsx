// Der Vertragsblock im Buchungsdialog — gehört diese Zahlung zu einem Vertrag?
//
// Eigene Datei seit dem Entzerren von `BuchungDetail.tsx` (2026-08-25). Der Block ist in
// sich abgeschlossen: er bekommt eine `VertragsBindung` und meldet Entscheidungen zurück,
// von dem Zustand der Maske ringsum weiss er nichts. Genau das macht ihn zum ersten
// Kandidaten fuers Herausziehen — nicht seine Groesse.

import { useTranslation } from "react-i18next";
import type { Vertrag, Vertragszuordnung } from "../../../application";
import { Auswahl } from "../bausteine/Auswahl";
import { Button, Pill } from "../bausteine";

/**
 * Alles, was diese Buchung mit einem Vertrag verbindet — und die Wege, das zu ändern.
 * Als eigenes Objekt gebündelt, weil es sonst fünf weitere Einzel-Props an einem Modal
 * wären, das schon reichlich davon trägt.
 */
export interface VertragsBindung {
  /** Der zugeordnete Vertrag, falls es einen gibt. */
  readonly vertrag?: Vertrag;
  /** Die gespeicherte Zuordnung — ihre Herkunft entscheidet, was angeboten wird. */
  readonly zuordnung?: Vertragszuordnung;
  /** Alle Verträge, zur Auswahl von Hand. */
  readonly alle: readonly Vertrag[];
  /** Von Hand setzen; `null` heißt „gehört ausdrücklich zu keinem Vertrag". */
  readonly zuordnen: (vertragId: string | null) => void | Promise<void>;
  /** Handentscheidung zurücknehmen — ab dann entscheidet wieder die Automatik. */
  readonly zuruecksetzen: () => void | Promise<void>;
  /** Aus dieser Buchung einen neuen Vertrag machen. */
  readonly neuAnlegen: () => void;
}

/**
 * Der Vertragsblock im Buchungsdialog. Drei Zustände an EINER Stelle, weil es dieselbe
 * Frage ist: gehört diese Zahlung zu einem Vertrag, zu keinem, oder soll sie einer werden?
 *
 * Sichtbar ist immer auch die HERKUNFT der Antwort. Das ist kein Beiwerk: „automatisch
 * erkannt" darf man überstimmen und der nächste Abgleich rechnet es neu, „von Hand"
 * bleibt stehen, bis man es zurücknimmt. Wer den Unterschied nicht sieht, weiß nicht,
 * ob seine Korrektur hält.
 *
 * **Alles davon steht in EINER Zeile.** Vorher waren es zwei: oben eine Pille mit dem
 * Anbieternamen, darunter das Auswahlfeld. Der Name stand damit zweimal da — das
 * Auswahlfeld zeigt die getroffene Wahl ohnehin an —, und dieselbe Aussage über zwei
 * Zeilen verteilt liest sich wie zwei Angaben. Übrig bleibt, was das Feld NICHT sagt:
 * woher die Zuordnung kommt, und die beiden Wege daneben.
 */
export function VertragsBlock({ bindung }: { bindung: VertragsBindung }) {
  const { t } = useTranslation();
  const { vertrag, zuordnung, alle } = bindung;
  const vonHand = zuordnung?.herkunft === "manuell";
  // Ausdrücklich zu keinem Vertrag: eine Aussage, kein fehlender Wert.
  const ausgeschlossen = vonHand && zuordnung?.vertragId === null;

  return (
    <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
      {/* Zuordnen von Hand — auch der Weg zurück: „kein Vertrag" ist eine gültige Wahl.
          Die Pille daneben sagt, WOHER die angezeigte Wahl kommt; sie erscheint nur,
          wenn es überhaupt eine gibt. Bei „noch offen" gäbe es keine Herkunft zu
          melden, und eine Pille „automatisch" an einem leeren Feld hiesse, die
          Erkennung hätte sich entschieden — sie hat nur nichts gefunden. */}
      {/* `feldzeile` und nicht ein eigenes Flex: hier stand laengst `display: flex`, und
          trotzdem lag nichts nebeneinander. `.field` ist `width: 100%` — das Auswahlfeld
          nahm die ganze Zeile, und alles Weitere brach um. Die Klasse gibt dem Feld das
          `min-width: 0`, ohne das ein Flex-Kind auf seiner vollen Breite besteht. */}
      <div className="feldzeile">
        <div className="feldzeile-feld">
          <Auswahl
            ariaLabel={t("konten.zuVertrag.waehlen")}
            wert={vertrag?.id ?? (ausgeschlossen ? "__keiner" : "")}
            aufAenderung={(v) => bindung.zuordnen(v === "__keiner" || v === "" ? null : v)}
            optionen={[
              { wert: "", text: t("konten.zuVertrag.offen") },
              { wert: "__keiner", text: t("konten.zuVertrag.keiner") },
              ...alle.map((v) => ({ wert: v.id, text: v.anbieter })),
            ]}
          />
        </div>
        {(vertrag || ausgeschlossen) && (
          <Pill variant={vonHand ? "neutral" : "ok"}>
            {t(vonHand ? "konten.zuVertrag.vonHand" : "konten.zuVertrag.automatisch")}
          </Pill>
        )}
        {vonHand && (
          <button className="linkbtn" onClick={() => bindung.zuruecksetzen()}>
            {t("konten.zuVertrag.zuruecksetzen")}
          </button>
        )}
        {/* „Vertrag daraus machen" gibt es nur, solange keiner zugeordnet ist — sonst
            wäre es ein Angebot, zwei Verträge für dieselbe Zahlung anzulegen. */}
        {!vertrag && !ausgeschlossen && (
          <div className="feldzeile-knopf">
            <Button onClick={bindung.neuAnlegen}>{t("konten.zuVertrag.aktion")}</Button>
          </div>
        )}
      </div>

      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
        {t(vonHand ? "konten.zuVertrag.vonHandHinweis" : vertrag ? "konten.zuVertrag.gehoertZuHinweis" : "konten.zuVertrag.untertitel")}
      </div>
    </div>
  );
}

