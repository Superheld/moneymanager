// Sammelbearbeitung — der Dialog für „diese dreissig Zeilen bitte alle so".
//
// Der Unterschied zum Einzeldialog ist nicht die Zahl der Felder, sondern die Bedeutung
// des leeren Feldes: hier heisst leer „nicht anfassen". Deshalb trägt jedes Feld einen
// eigenen Schalter — ohne den wäre nicht zu sehen, ob ein leeres Feld die Notiz löschen
// oder in Ruhe lassen soll, und man erführe es erst hinterher.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { IstBuchung, Kategorie, Sammelziel, Vertrag } from "../../../application";
import { buchungenLoeschen, buchungenSammelbearbeiten, vertraegeSammelZuordnen } from "../../dienste";
import { Button, FormField, Pill } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { CategoryPicker } from "../bausteine/CategoryPicker";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";

/** Die Auswahl der Maske → das Ziel des Use-Case. Zwei Sonderwerte, sonst eine Vertrags-Id. */
function sammelziel(wahl: string): Sammelziel {
  if (wahl === "__automatik") return { art: "automatik" };
  if (wahl === "__keiner") return { art: "keiner" };
  return { art: "vertrag", vertragId: wahl };
}

export function SammelDialog({
  buchungen,
  kategorien,
  vertraege,
  gesperrteIds,
  onClose,
  onGeaendert,
}: {
  buchungen: IstBuchung[];
  kategorien: Kategorie[];
  vertraege: readonly Vertrag[];
  /** IDs der Buchungen, die aus einem Bankabruf stammen — die werden nicht gelöscht. */
  gesperrteIds: ReadonlySet<string>;
  onClose: () => void;
  onGeaendert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [kategorieAn, setKategorieAn] = useState(false);
  const [kategorieId, setKategorieId] = useState("");
  const [notizAn, setNotizAn] = useState(false);
  const [notiz, setNotiz] = useState("");
  // Die Vertragswahl hat DREI Ziele und nicht zwei — „keiner" ist eine Aussage, nicht ein
  // fehlender Wert (siehe `Sammelziel`). Der Anfangswert ist deshalb die Automatik: das
  // ist der Zustand, aus dem heraus man entscheidet.
  const [vertragAn, setVertragAn] = useState(false);
  const [vertragWahl, setVertragWahl] = useState("__automatik");
  const [loeschenGefragt, setLoeschenGefragt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const summe = buchungen.reduce((s, b) => s + b.betrag, 0);
  const gesperrt = buchungen.filter((b) => gesperrteIds.has(b.id)).length;
  const umbuchungen = buchungen.filter((b) => b.transferId).length;
  const zielArt = sammelziel(vertragWahl).art;
  /**
   * Umschichtungen unter den Gewaehlten — sie zaehlen als Beleg NICHT.
   *
   * Eine Verschiebung zwischen eigenen Konten ist keine Vertragszahlung (`passtZu` laesst
   * sie aus), und ihr Empfaengerfeld traegt je nach Bank die eigene IBAN, den eigenen
   * Namen oder nichts. Zuordnen darf man sie trotzdem — bei einem Umbuchungsvertrag ist
   * genau das der Fall. Nur eine Ableitung gewinnt daraus nichts, und das gehoert
   * vorher gesagt und nicht hinterher gerechnet.
   */
  const umschichtungen = buchungen.filter((b) => b.charakter === "Umschichtung").length;

  async function speichern() {
    setFehler(null);
    setBusy(true);
    try {
      await buchungenSammelbearbeiten(
        buchungen,
        {
          kategorieId: kategorieAn ? (kategorieId || null) : undefined,
          notiz: notizAn ? notiz : undefined,
        },
        kategorien,
      );
      if (vertragAn) {
        await vertraegeSammelZuordnen(buchungen.map((b) => b.id), sammelziel(vertragWahl));
      }
      await onGeaendert();
      onClose();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setBusy(false);
    }
  }

  async function loeschen() {
    setFehler(null);
    setBusy(true);
    try {
      await buchungenLoeschen(buchungen, gesperrteIds);
      await onGeaendert();
      onClose();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("konten.sammel.titel", { n: buchungen.length })}
      subtitle={t("konten.sammel.untertitel", { summe: geld.formatMitSymbol(summe, { mitVorzeichen: true }) })}
      onClose={onClose}
      footer={
        loeschenGefragt ? (
          <>
            {/* Löschen ist der einzige Weg hier, der nichts zurücklässt — deshalb eine
                zweite Frage, und die Zahl steht darin. */}
            <Button variant="primary" onClick={() => void loeschen()}>
              {t("konten.sammel.loeschenBestaetigen", { n: buchungen.length - gesperrt })}
            </Button>
            <button className="linkbtn" onClick={() => setLoeschenGefragt(false)}>{t("konten.abbrechen")}</button>
          </>
        ) : (
          <>
            <Button variant="primary" onClick={busy ? () => {} : () => void speichern()}>
              {t("konten.sammel.anwenden")}
            </Button>
            <button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>
            <button
              className="linkbtn"
              style={{ marginLeft: "auto", color: "var(--warn-deep)" }}
              onClick={() => setLoeschenGefragt(true)}
            >
              {t("konten.loeschen")}
            </button>
          </>
        )
      }
    >
      {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}

      {loeschenGefragt ? (
        <div>
          <p style={{ margin: 0 }}>{t("konten.sammel.loeschenFrage", { n: buchungen.length - gesperrt })}</p>
          {gesperrt > 0 && (
            <p className="muted" style={{ fontSize: "var(--fs-small)", marginTop: "var(--sp-3)" }}>
              {t("konten.sammel.loeschenGesperrt", { n: gesperrt })}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="form-grid">
            <FormField
              label={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={kategorieAn}
                    aria-label={t("konten.sammel.kategorieSetzen")}
                    onChange={(e) => setKategorieAn(e.target.checked)}
                    style={{ accentColor: "var(--accent-deep)" }}
                  />
                  {t("konten.sammel.kategorieSetzen")}
                </span>
              }
              hint={kategorieAn && !kategorieId ? t("konten.sammel.kategorieLeeren") : undefined}
            >
              <span style={{ opacity: kategorieAn ? 1 : 0.45, pointerEvents: kategorieAn ? "auto" : "none" }}>
                <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={setKategorieId} />
              </span>
            </FormField>

            <FormField
              label={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={notizAn}
                    aria-label={t("konten.sammel.bezeichnungSetzen")}
                    onChange={(e) => setNotizAn(e.target.checked)}
                    style={{ accentColor: "var(--accent-deep)" }}
                  />
                  {t("konten.sammel.bezeichnungSetzen")}
                </span>
              }
              hint={t("konten.sammel.bezeichnungHinweis")}
            >
              <input
                className="field"
                aria-label={t("konten.sammel.bezeichnungSetzen")}
                value={notiz}
                disabled={!notizAn}
                onChange={(e) => setNotiz(e.target.value)}
                placeholder={t("konten.sammel.bezeichnungPlatzhalter")}
              />
            </FormField>

            {/* Die Vertragszuordnung. Sie geht NICHT über `buchungenSammelbearbeiten`,
                sondern über einen eigenen Use-Case: sie schreibt in eine andere Tabelle
                und trägt eine Herkunft, die der nächste Abgleich respektieren muss. */}
            <FormField
              label={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={vertragAn}
                    aria-label={t("konten.sammel.vertragSetzen")}
                    onChange={(e) => setVertragAn(e.target.checked)}
                    style={{ accentColor: "var(--accent-deep)" }}
                  />
                  {t("konten.sammel.vertragSetzen")}
                </span>
              }
              hint={vertragAn ? t(`konten.sammel.vertragHinweis.${zielArt}`) : undefined}
            >
              <span style={{ opacity: vertragAn ? 1 : 0.45, pointerEvents: vertragAn ? "auto" : "none" }}>
                <Auswahl
                  ariaLabel={t("konten.sammel.vertragSetzen")}
                  wert={vertragWahl}
                  aufAenderung={setVertragWahl}
                  optionen={[
                    { wert: "__automatik", text: t("konten.sammel.vertragAutomatik") },
                    { wert: "__keiner", text: t("konten.sammel.vertragKeiner") },
                    ...vertraege.map((v) => ({ wert: v.id, text: v.anbieter })),
                  ]}
                />
              </span>
            </FormField>
          </div>

          {/* Was an dieser Auswahl NICHT geht, steht vorher da — nicht als Fehlermeldung
              danach. */}
          {(umbuchungen > 0 || gesperrt > 0 || (vertragAn && umschichtungen > 0)) && (
            <div style={{ marginTop: "var(--sp-4)", display: "flex", flexDirection: "column", gap: 6 }}>
              {umbuchungen > 0 && (
                <span className="muted" style={{ fontSize: "var(--fs-xs)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Pill variant="um">{t("konten.pillUmbuchung")}</Pill>
                  {t("konten.sammel.umbuchungHinweis", { n: umbuchungen })}
                </span>
              )}
              {gesperrt > 0 && (
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {t("konten.sammel.onlineHinweis", { n: gesperrt })}
                </span>
              )}
              {vertragAn && zielArt === "vertrag" && umschichtungen > 0 && (
                <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                  {t("konten.sammel.vertragUmschichtungHinweis", { n: umschichtungen })}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
