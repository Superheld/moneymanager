// Aufteilen (S-7) — eine Buchung auf mehrere Kategorien verteilen.
//
// Eigene Datei, seit `BuchungDetail.tsx` 2026-08-25 entzerrt wurde: der Dialog hat mit
// dem Buchungsformular nichts gemeinsam ausser dem Weg dorthin. Er wird von genau einer
// Stelle benutzt und bleibt deshalb im Bereichsordner statt in `bausteine/` (siehe
// `bausteine/CLAUDE.md`: was ein Screen benutzt, gehoert zu diesem Screen).

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { minorZuMajor, type IstBuchung, type Kategorie } from "../../../application";
import { offenerRest } from "../../../application/buchung/buchungSplitten";
import { buchungSplitten } from "../../dienste";
import { Button } from "../bausteine";
import { CategoryPicker } from "../bausteine/CategoryPicker";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";

/**
 * S-7 — Buchung auf mehrere Kategorien aufteilen. Der Betrag der Buchung bleibt, was er
 * ist; verteilt wird nur die Kategorie-Zuordnung. Der Dialog lässt sich nicht speichern,
 * solange der Rest nicht null ist — die Invariante steht im Use-Case, hier wird sie nur
 * früh genug sichtbar gemacht.
 *
 * Beträge werden POSITIV eingegeben; das Vorzeichen kommt von der Buchung.
 */
export function SplitModal({ buchung, kategorien, onClose, onSaved }: { buchung: IstBuchung; kategorien: Kategorie[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();

  /** Vorbelegung: eine bestehende Aufteilung weiterbearbeiten, sonst zwei leere Zeilen. */
  const [zeilen, setZeilen] = useState<{ kategorieId: string; betrag: string; notiz: string }[]>(() =>
    buchung.aufteilungen?.length
      ? buchung.aufteilungen.map((a) => ({
          kategorieId: a.kategorieId,
          betrag: String(minorZuMajor(Math.abs(a.betrag), geld.waehrung)),
          notiz: a.notiz ?? "",
        }))
      : [
          { kategorieId: buchung.kategorieId ?? "", betrag: String(minorZuMajor(Math.abs(buchung.betrag), geld.waehrung)), notiz: "" },
          { kategorieId: "", betrag: "", notiz: "" },
        ],
  );
  const [fehler, setFehler] = useState<string | null>(null);

  const eingaben = zeilen.map((z) => ({ kategorieId: z.kategorieId, betrag: geld.parse(z.betrag) ?? 0, notiz: z.notiz }));
  const rest = offenerRest(buchung, eingaben);
  const verteilt = Math.abs(buchung.betrag) - rest;

  function aendere(i: number, feld: "kategorieId" | "betrag" | "notiz", wert: string) {
    setZeilen((zs) => zs.map((z, j) => (j === i ? { ...z, [feld]: wert } : z)));
  }

  /** Den offenen Rest in eine Zeile übernehmen — spart das Kopfrechnen bei drei Teilen. */
  function restEinsetzen(i: number) {
    const schon = geld.parse(zeilen[i].betrag) ?? 0;
    setZeilen((zs) => zs.map((z, j) => (j === i ? { ...z, betrag: String(minorZuMajor(schon + rest, geld.waehrung)) } : z)));
  }

  async function speichern() {
    setFehler(null);
    try {
      await buchungSplitten(buchung, eingaben);
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("konten.split.titel")}
      subtitle={t("konten.split.untertitel")}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={speichern}>{t("konten.speichern")}</Button>
          <button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>
          {fehler && <span className="err">{fehler}</span>}
        </>
      }
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>{t("konten.split.gesamt")}</span>
        <span className="num" style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-black)", color: geldFarbe(buchung.betrag) }}>
          {geld.formatMitSymbol(buchung.betrag, { mitVorzeichen: true })}
        </span>
      </div>

      {zeilen.map((z, i) => (
        <div key={i} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "flex-start", padding: "6px 0", borderBottom: "1px solid var(--line-soft)", flexWrap: "wrap" }}>
          <span style={{ flex: "2 1 180px", minWidth: 150 }}>
            <CategoryPicker kategorien={kategorien} value={z.kategorieId} onChange={(v) => aendere(i, "kategorieId", v)} />
          </span>
          <input
            className="field"
            inputMode="decimal"
            style={{ flex: "0 1 110px", minWidth: 90 }}
            value={z.betrag}
            onChange={(e) => aendere(i, "betrag", e.target.value)}
            placeholder={geld.format(0)}
            aria-label={`${t("konten.split.spalteBetrag")} ${i + 1}`}
          />
          {rest !== 0 && (
            <button className="linkbtn" title={t("konten.split.restVerteilen")} onClick={() => restEinsetzen(i)} style={{ padding: "6px 4px" }}>+</button>
          )}
          {zeilen.length > 2 && (
            <button className="linkbtn" onClick={() => setZeilen((zs) => zs.filter((_, j) => j !== i))}>
              {t("konten.split.zeileEntfernen")}
            </button>
          )}
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap", marginTop: "var(--sp-3)" }}>
        <Button plus onClick={() => setZeilen((zs) => [...zs, { kategorieId: "", betrag: "", notiz: "" }])}>
          {t("konten.split.zeileHinzufuegen")}
        </Button>
        <span style={{ fontSize: 13, fontWeight: "var(--fw-bold)", color: rest === 0 ? "var(--ok-deep)" : "var(--warn-deep)" }}>
          {rest === 0
            ? t("konten.split.restPasst")
            : rest > 0
              ? t("konten.split.restOffen", { betrag: geld.formatMitSymbol(rest) })
              : t("konten.split.restZuviel", { betrag: geld.formatMitSymbol(-rest) })}
        </span>
      </div>
      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
        {t("konten.split.hinweisPositiv")} · {t("konten.split.verteilt")}: {geld.formatMitSymbol(verteilt)}
      </div>
    </Modal>
  );
}

