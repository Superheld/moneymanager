// Sammelbearbeitung — der Dialog für „diese dreissig Zeilen bitte alle so".
//
// Der Unterschied zum Einzeldialog ist nicht die Zahl der Felder, sondern die Bedeutung
// des leeren Feldes: hier heisst leer „nicht anfassen". Deshalb trägt jedes Feld einen
// eigenen Schalter — ohne den wäre nicht zu sehen, ob ein leeres Feld die Notiz löschen
// oder in Ruhe lassen soll, und man erführe es erst hinterher.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { IstBuchung, Kategorie } from "../../core";
import {
  buchungenLoeschen,
  buchungenSammelbearbeiten,
} from "../../application/buchungenSammelbearbeiten";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { Button, FormField, Pill } from "./ds";
import { CategoryPicker } from "./CategoryPicker";
import { Modal } from "./Modal";
import { fehlerNachricht, useGeld } from "./einstellungenKontext";

export function SammelDialog({
  buchungen,
  kategorien,
  gesperrteIds,
  onClose,
  onGeaendert,
}: {
  buchungen: IstBuchung[];
  kategorien: Kategorie[];
  /** Konten an einer Bankverbindung — dort wird nicht von Hand gelöscht. */
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
  const [loeschenGefragt, setLoeschenGefragt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const summe = buchungen.reduce((s, b) => s + b.betrag, 0);
  const gesperrt = buchungen.filter((b) => gesperrteIds.has(b.id)).length;
  const umbuchungen = buchungen.filter((b) => b.transferId).length;

  async function speichern() {
    setFehler(null);
    setBusy(true);
    try {
      await buchungenSammelbearbeiten(
        ledgerRepo,
        buchungen,
        {
          kategorieId: kategorieAn ? (kategorieId || null) : undefined,
          notiz: notizAn ? notiz : undefined,
        },
        kategorien,
      );
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
      await buchungenLoeschen(ledgerRepo, buchungen, gesperrteIds);
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
          </div>

          {/* Was an dieser Auswahl NICHT geht, steht vorher da — nicht als Fehlermeldung
              danach. */}
          {(umbuchungen > 0 || gesperrt > 0) && (
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
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
