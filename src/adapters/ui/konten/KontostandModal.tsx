// Die zwei Dialoge rund um den Kontostands-Anker.
//
// Sie sehen ähnlich aus und tun Verschiedenes — deshalb stehen sie nebeneinander in einer
// Datei, damit der Unterschied beim Lesen auffällt:
//
//   • **Kassensturz** legt eine BEOBACHTUNG an: „am 20.08. lagen 47,50 € im
//     Portemonnaie." Sie wird nie falsch und ändert nichts am Bestand.
//   • **Abgleich** ändert den ANFANGSBESTAND, damit die Rechnung den letzten Anker
//     trifft. Das ist ein Eingriff, und er gehört einmalig gemacht — deshalb steht die
//     Zahl, um die es geht, vorher da.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Kontozeile } from "../../../application";
import { anfangsbestandAbgleichen, kontostandFesthalten } from "../../dienste";
import { Button, FormField } from "../bausteine";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";

/** Kassensturz — für Konten, bei denen keine Bank etwas meldet. */
export function KassensturzModal({
  kontoId,
  bezeichnung,
  heute,
  onClose,
  onGespeichert,
}: {
  kontoId: string;
  bezeichnung: string;
  heute: string;
  onClose: () => void;
  onGespeichert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [datum, setDatum] = useState(heute);
  const [betrag, setBetrag] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function speichern() {
    setFehler(null);
    const cent = geld.parse(betrag);
    if (cent == null) {
      setFehler(t("konten.anker.betragUnklar"));
      return;
    }
    setBusy(true);
    try {
      await kontostandFesthalten({ kontoId, datum, betrag: cent });
      await onGespeichert();
      onClose();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("konten.anker.kassensturzTitel")}
      subtitle={bezeichnung}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={busy ? () => {} : () => void speichern()}>
            {t("konten.anker.festhalten")}
          </Button>
          <button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>
        </>
      }
    >
      {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}
      <p className="muted" style={{ marginTop: 0, fontSize: "var(--fs-xs)" }}>
        {t("konten.anker.kassensturzHinweis")}
      </p>
      <div className="form-grid">
        <FormField label={t("konten.anker.stichtag")} required>
          <input
            className="field"
            type="date"
            aria-label={t("konten.anker.stichtag")}
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
          />
        </FormField>
        <FormField label={t("konten.anker.betrag")} required>
          <input
            className="field"
            aria-label={t("konten.anker.betrag")}
            value={betrag}
            onChange={(e) => setBetrag(e.target.value)}
            inputMode="decimal"
            placeholder={geld.format(0)}
          />
        </FormField>
      </div>
    </Modal>
  );
}

/** Der einmalige Abgleich des Anfangsbestands auf den jüngsten Anker. */
export function AbgleichModal({
  zeile,
  onClose,
  onFertig,
}: {
  zeile: Kontozeile;
  onClose: () => void;
  onFertig: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const neu = zeile.anfangsbestandVorschlag ?? zeile.konto.saldo;

  async function anwenden() {
    setFehler(null);
    setBusy(true);
    try {
      await anfangsbestandAbgleichen(zeile.konto.id);
      await onFertig();
      onClose();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t("konten.anker.abgleichTitel")}
      subtitle={zeile.konto.bezeichnung}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={busy ? () => {} : () => void anwenden()}>
            {t("konten.anker.abgleichBestaetigen")}
          </Button>
          <button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>
        </>
      }
    >
      {fehler && <div className="err" style={{ marginBottom: "var(--sp-3)" }}>{fehler}</div>}
      {/* Erst die Zahlen, dann die Folge. Wer hier zustimmt, soll wissen, dass die
          Differenz nicht verschwindet, sondern umzieht. */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <tbody>
          <tr>
            <td style={{ padding: "4px 0", color: "var(--ink-3)" }}>{t("konten.anker.alt")}</td>
            <td className="num" style={{ padding: "4px 0", textAlign: "right" }}>{geld.formatMitSymbol(zeile.konto.saldo)}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 0", color: "var(--ink-3)" }}>{t("konten.anker.neu")}</td>
            <td className="num" style={{ padding: "4px 0", textAlign: "right", fontWeight: "var(--fw-bold)" }}>{geld.formatMitSymbol(neu)}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 0", color: "var(--ink-3)" }}>{t("konten.anker.verschoben")}</td>
            <td className="num" style={{ padding: "4px 0", textAlign: "right" }}>
              {geld.formatMitSymbol(neu - zeile.konto.saldo, { mitVorzeichen: true })}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: 0 }}>
        {t("konten.anker.abgleichHinweis")}
      </p>
      {zeile.luecken.length > 0 && (
        <p style={{ fontSize: "var(--fs-xs)", color: "var(--warn-deep)", marginBottom: 0 }}>
          {t("konten.anker.abgleichWarnung", { n: zeile.luecken.length })}
        </p>
      )}
    </Modal>
  );
}
