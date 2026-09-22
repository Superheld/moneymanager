// Ein Konto loswerden — die EINE Stelle, an der das entschieden wird.
//
// **Warum es diesen Dialog gibt.** Vorher standen drei Aktionen in der Zeile: stilllegen,
// löschen, und bei einem stillgelegten Konto zusätzlich endgültig löschen. Drei Dinge, die
// zusammengehören, nebeneinander — und nichts sagte, wie. Dazu drei Mängel, die erst beim
// Benutzen auffielen:
//
//  • **Der Mülleimer war ein Knopf, der fast immer Nein sagt.** Für jedes Konto mit
//    Geschichte konnte er nur ablehnen. Seine Meldung war ehrlich, aber eine ehrliche
//    Absage ist immer noch eine Absage: der Knopf gehörte gar nicht dorthin.
//  • **Der Icon-Satz wechselte** — drei Symbole an einem geführten Konto, vier an einem
//    stillgelegten. Was erscheint und verschwindet, lernt niemand.
//  • **Der Zusammenhang stand nirgends.** Dass Stilllegen die milde Fassung ist und das
//    endgültige Löschen erst danach auftaucht, musste man herausfinden.
//
// Jetzt ist es EIN Symbol in der Zeile, immer dasselbe, und dieser Dialog bietet an, was im
// aktuellen Zustand möglich ist. Der Unterschied zu vorher ist nicht die Zahl der Klicks,
// sondern dass die Wahl mit ihrer Begründung an einem Ort steht.
//
// **Und er ist selbst die Rückfrage — es kommt keine zweite.** Er nennt jede Folge, bevor
// irgendetwas passiert, und die zerstörende Handlung trägt ihren Namen auf dem Knopf. Ein
// „Wirklich löschen?" dahinter wäre genau das, wovor `Loeschfrage` warnt: eine Verzögerung
// ohne Information, die man nach dem zweiten Mal wegklickt.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { istAktiv, istLoeschbar, type Kontoloeschung, type Zahlungskonto } from "../../../application";
import {
  kontoLoeschen,
  kontoStilllegen,
  kontoVollstaendigLoeschen,
  kontoWiederaufnehmen,
} from "../../dienste";
import { Button, Pill } from "../bausteine";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht } from "../bausteine/einstellungenKontext";

/**
 * Eine Aufzählung — „37 Buchungen, 214 importierte Zahlungen und eine Bankverbindung".
 *
 * **Nur was zählt, kommt hinein.** Ein „0 Buchungen" liest sich wie ein Fehler im Programm
 * und verlängert einen Satz, der ohnehin schon etwas erklärt. Deshalb wird gefiltert und
 * nicht formatiert.
 */
function teileText(t: TFunction, teile: readonly (string | null)[]): string {
  const da = teile.filter((x): x is string => x !== null);
  if (da.length <= 1) return da[0] ?? "";
  return `${da.slice(0, -1).join(", ")} ${t("konten.und")} ${da[da.length - 1]}`;
}

/** Was am Konto hängt und beim endgültigen Löschen mitgeht. */
function sperrenText(t: TFunction, l: Kontoloeschung): string {
  return teileText(t, [
    l.buchungen > 0 ? t("konten.loeschsperreBuchungen", { count: l.buchungen }) : null,
    l.belege > 0 ? t("konten.loeschsperreBelege", { count: l.belege }) : null,
    l.bankverbindung ? t("konten.loeschsperreBankverbindung") : null,
  ]);
}

/** Was auf das Konto zeigt, ohne daran zu hängen — es verliert nur einen Verweis. */
function folgenText(t: TFunction, l: Kontoloeschung): string {
  return teileText(t, [
    l.budgets > 0 ? t("konten.folgenBudgets", { count: l.budgets }) : null,
    l.ruecklagen > 0 ? t("konten.folgenRuecklagen", { count: l.ruecklagen }) : null,
    l.regeln > 0 ? t("konten.folgenRegeln", { count: l.regeln }) : null,
    l.erkennungsregeln > 0 ? t("konten.folgenErkennung", { count: l.erkennungsregeln }) : null,
  ]);
}

/**
 * Eine Wahl mit ihrer Begründung darunter.
 *
 * Die Erklärung steht bei der Handlung und nicht gesammelt darüber: ein Absatz, der beide
 * Wege beschreibt, verlangt vom Leser, ihn auf die Knöpfe zu verteilen — und genau dabei
 * verwechselt man sie.
 */
function Wahl({
  text,
  erklaerung,
  gefahr,
  laeuft,
  onClick,
}: {
  text: string;
  erklaerung: string;
  gefahr?: boolean;
  laeuft: boolean;
  onClick: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
      {/* Der harmlose Weg ist `primary`, der zerstörende nicht — und das Design-System hat
          keinen Gefahren-Knopf, in dem hier nichts erfunden wird. Die Warnung trägt deshalb
          der Text darunter, in derselben Farbe wie jede andere Warnung der App. */}
      {!laeuft && (
        <span>
          <Button variant={gefahr ? "default" : "primary"} onClick={onClick}>
            {text}
          </Button>
        </span>
      )}
      <p
        className={gefahr ? "err" : "muted"}
        style={{ margin: 0, maxWidth: "52ch" }}
      >
        {erklaerung}
      </p>
    </div>
  );
}

export function KontoAufloesenModal({
  konto,
  loeschung,
  onClose,
  onFertig,
}: {
  konto: Zahlungskonto;
  /** Was am Konto hängt — vom Aufrufer geladen, damit der Dialog nicht leer aufgeht. */
  loeschung: Kontoloeschung;
  onClose: () => void;
  /** Es ist etwas passiert: schliessen und neu laden. */
  onFertig: () => void;
}) {
  const { t } = useTranslation();
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const gefuehrt = istAktiv(konto);
  const leer = istLoeschbar(loeschung);
  const haengt = sperrenText(t, loeschung);
  const zeigenDrauf = folgenText(t, loeschung);

  async function tun(handlung: () => Promise<void>) {
    setLaeuft(true);
    setFehler(null);
    try {
      await handlung();
      onFertig();
    } catch (e) {
      // Der Dialog bleibt STEHEN und zeigt den Fehler — dieselbe Überlegung wie in
      // `Loeschfrage`: ein Löschen, das scheitert, sähe sonst aus wie ein gelungenes.
      setFehler(fehlerNachricht(t, e));
      setLaeuft(false);
    }
  }

  /**
   * Der Satz über den Wahlmöglichkeiten — was am Konto hängt.
   *
   * Er steht ÜBER beiden, weil er für beide gilt: dieselben Zahlen entscheiden, ob Stilllegen
   * etwas bewahrt und was ein Löschen mitnähme.
   */
  const bestand = leer
    ? t("konten.aufloesen.haengtNichts")
    : t("konten.aufloesen.haengtDran", { was: haengt });

  return (
    <Modal
      title={t("konten.aufloesen.titel", { konto: konto.bezeichnung })}
      subtitle={
        gefuehrt ? undefined : (
          <Pill variant="neutral">{t("konten.stillgelegt")}</Pill>
        )
      }
      onClose={laeuft ? () => {} : onClose}
      footer={
        <>
          <button className="linkbtn" onClick={onClose} disabled={laeuft}>
            {t("einstellungen.abbrechen")}
          </button>
          {laeuft && <span className="muted">{t("loeschen.laeuft")}</span>}
          {fehler && <span className="err">{fehler}</span>}
        </>
      }
    >
      <p style={{ margin: "0 0 var(--sp-4)" }}>{bestand}</p>
      {zeigenDrauf && (
        <p className="muted" style={{ margin: "0 0 var(--sp-4)", maxWidth: "52ch" }}>
          {t("konten.aufloesen.zeigenDrauf", { was: zeigenDrauf })}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-5)" }}>
        {gefuehrt ? (
          <>
            <Wahl
              text={t("konten.stilllegen")}
              // Die zweite Hälfte der Erklärung ist der eigentliche Zugewinn dieses
              // Dialogs: sie sagt, was DANACH möglich ist. Ohne sie musste man die Abfolge
              // durch Ausprobieren finden.
              erklaerung={`${t("konten.stilllegenHinweis")} ${t("konten.aufloesen.danach")}`}
              laeuft={laeuft}
              onClick={() => void tun(() => kontoStilllegen(konto.id))}
            />
            {/* **Ein leeres Konto darf direkt gehen.** Die Abfolge (erst stilllegen) ist
                dafür da, eine GESCHICHTE nicht versehentlich wegzuwerfen — gibt es keine,
                schützt sie nichts und kostet nur einen Umweg. Das ist der Fall, den man am
                häufigsten hat: ein Konto, das aus Versehen entstanden ist. */}
            {leer && (
              <Wahl
                text={t("einstellungen.loeschen")}
                erklaerung={t("konten.aufloesen.loeschenLeer")}
                gefahr
                laeuft={laeuft}
                onClick={() => void tun(() => kontoLoeschen(konto.id))}
              />
            )}
          </>
        ) : (
          <>
            <Wahl
              text={t("konten.wiederaufnehmen")}
              erklaerung={t("konten.wiederaufnehmenHinweis")}
              laeuft={laeuft}
              onClick={() => void tun(() => kontoWiederaufnehmen(konto.id))}
            />
            <Wahl
              // Das Wort folgt dem Inhalt: hängt nichts dran, ist „endgültig" ein grosses
              // Wort für das Entfernen einer leeren Zeile.
              text={leer ? t("einstellungen.loeschen") : t("konten.endgueltigLoeschen")}
              erklaerung={
                leer
                  ? t("konten.aufloesen.loeschenLeer")
                  : [
                      t("konten.endgueltigFolgen", { was: haengt }),
                      loeschung.umbuchungspaare > 0
                        ? t("konten.endgueltigPaare", { count: loeschung.umbuchungspaare })
                        : null,
                      zeigenDrauf ? t("konten.endgueltigFolgenLos", { was: zeigenDrauf }) : null,
                      t("konten.endgueltigSicherung"),
                    ]
                      .filter(Boolean)
                      .join(" ")
              }
              gefahr
              laeuft={laeuft}
              onClick={() => void tun(() => kontoVollstaendigLoeschen(konto.id))}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
