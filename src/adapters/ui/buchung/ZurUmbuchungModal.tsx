// Zur Umbuchung machen (S-1) — aus einer gebuchten Zeile ein Umbuchungs-Bein machen.
//
// Eigene Datei aus demselben Grund wie `SplitModal`: ein Dialog, der vom Buchungsformular
// aus geoeffnet wird, aber nichts von dessen Zustand braucht.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IstBuchung, Zahlungskonto } from "../../../application";
import type { Umsatz } from "../../../application/import";
import { paarungsKandidaten, MAX_VORSCHLAG_TAGE } from "../../../application/buchung/umbuchungAusBuchung";
import { buchungenPaaren, gegenbeinErzeugen } from "../../dienste";
import { Auswahl } from "../bausteine/Auswahl";
import { Button } from "../bausteine";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";
import { ddmm } from "./ddmm";

/**
 * S-1 — macht aus einer bestehenden Buchung eine Umbuchung. EIN Dialog für beide Fälle:
 * oben die passenden Gegenbuchungen (S-1b, nachträgliche Paarung), darunter der Ausweg
 * „Gegenbein neu erzeugen" (S-1a, Zielkonto wird nicht importiert). Der Nutzer soll nicht
 * vorher wissen müssen, welcher Fall vorliegt — die Liste beantwortet das.
 */
export function ZurUmbuchungModal({ buchung, konten, onlineKonten, alleBuchungen, kontoName, umsatzByIst, onClose, onSaved }: { buchung: IstBuchung; konten: Zahlungskonto[]; onlineKonten: ReadonlySet<string>; alleBuchungen: IstBuchung[]; kontoName: Map<string, string>; umsatzByIst: Map<string, Umsatz>; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const kandidaten = useMemo(() => paarungsKandidaten(alleBuchungen, buchung), [alleBuchungen, buchung]);
  // Erzeugt wird nur auf Konten ohne Bankverbindung — siehe `gegenbeinErzeugen`. Die
  // Gegenbuchungen darüber sind davon nicht betroffen: die existieren schon.
  const andereKonten = konten.filter((k) => k.id !== buchung.kontoId && !onlineKonten.has(k.id));
  // Vorauswahl: der beste Kandidat, sonst der Weg über ein neu erzeugtes Gegenbein — den
  // aber nur, wenn es überhaupt ein Konto gibt, auf dem erzeugt werden darf.
  const [wahl, setWahl] = useState<string>(kandidaten[0]?.id ?? (andereKonten.length > 0 ? "__neu" : ""));
  const [neuKontoId, setNeuKontoId] = useState(andereKonten[0]?.id ?? "");
  const nichtsZuTun = kandidaten.length === 0 && andereKonten.length === 0;
  const [fehler, setFehler] = useState<string | null>(null);

  /** Beschriftung einer Gegenbuchung: Empfänger aus dem Import, sonst Notiz. */
  function kandidatLabel(k: IstBuchung): string {
    return umsatzByIst.get(k.id)?.gegenpartei || k.notiz || "";
  }

  async function speichern() {
    setFehler(null);
    try {
      if (wahl === "__neu") {
        await gegenbeinErzeugen(buchung, neuKontoId);
      } else {
        const gegen = alleBuchungen.find((b) => b.id === wahl);
        if (!gegen) return;
        await buchungenPaaren(buchung, gegen);
      }
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("konten.zurUmbuchung.titel")}
      subtitle={t("konten.zurUmbuchung.untertitel")}
      onClose={onClose}
      footer={<>
        {/* Gibt es weder eine Gegenbuchung noch ein Konto, auf dem erzeugt werden darf,
            hat der Knopf nichts zu bestätigen — dann führt nur der Weg zurück. */}
        {!nichtsZuTun && <Button variant="primary" onClick={speichern}>{t("konten.zurUmbuchung.bestaetigen")}</Button>}
        <button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>
        {fehler && <span className="err">{fehler}</span>}
      </>}
    >
      {/* Die Buchung, um die es geht */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap", padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--surface-2, var(--accent-wash))", marginBottom: "var(--sp-4)" }}>
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
          {ddmm(buchung.datum)} · {kandidatLabel(buchung) || kontoName.get(buchung.kontoId) || ""}
        </span>
        <span className="num" style={{ fontWeight: 700, color: geldFarbe(buchung.betrag) }}>
          {geld.formatMitSymbol(buchung.betrag, { mitVorzeichen: true })}
        </span>
      </div>

      <div style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)", marginBottom: 8 }}>
        {t("konten.zurUmbuchung.kandidatenTitel")}
      </div>
      {kandidaten.length === 0 ? (
        <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("konten.zurUmbuchung.keineKandidaten", { tage: MAX_VORSCHLAG_TAGE })}</div>
      ) : (
        kandidaten.map((k) => (
          <label key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line-soft)", cursor: "pointer" }}>
            <input type="radio" name="gegenbein" value={k.id} checked={wahl === k.id} onChange={() => setWahl(k.id)} style={{ accentColor: "var(--accent-deep)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{ddmm(k.datum)}</span>
            <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)", flex: 1, minWidth: 0 }}>
              {kontoName.get(k.kontoId) ?? "?"}
              {kandidatLabel(k) && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{kandidatLabel(k)}</span>}
            </span>
            <span className="num" style={{ fontWeight: 700, color: geldFarbe(k.betrag) }}>{geld.formatMitSymbol(k.betrag, { mitVorzeichen: true })}</span>
          </label>
        ))
      )}

      {/* Ausweg: kein Gegenbein vorhanden (S-1a).

          Fällt ganz weg, wenn alle übrigen Konten an einer Bank hängen — dort darf nichts
          erzeugt werden, und ein Radio-Knopf über einer leeren Auswahlliste wäre eine
          Handlung, die nicht geht. Statt dessen steht dort, warum: die Gegenseite meldet
          die Bank ohnehin, sie muss nur verbunden werden. */}
      {andereKonten.length > 0 ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "var(--sp-4) 0 var(--sp-3)", color: "var(--ink-3)", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)" }}>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            {t("konten.zurUmbuchung.oder")}
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="radio" name="gegenbein" value="__neu" checked={wahl === "__neu"} onChange={() => setWahl("__neu")} style={{ accentColor: "var(--accent-deep)" }} />
            <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>{t("konten.zurUmbuchung.neu")}</span>
            <span style={{ minWidth: 180 }}>
              <Auswahl
                ariaLabel={t("konten.zurUmbuchung.neu")}
                wert={neuKontoId}
                aufAenderung={(v) => { setNeuKontoId(v); setWahl("__neu"); }}
                optionen={andereKonten.map((k) => ({ wert: k.id, text: k.bezeichnung }))}
              />
            </span>
          </label>
          <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>{t("konten.zurUmbuchung.neuHinweis")}</div>
        </>
      ) : (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-4)" }}>
          {t("konten.zurUmbuchung.nurVerbinden")}
        </div>
      )}

      {buchung.kategorieId && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line-soft)" }}>
          {t("konten.zurUmbuchung.kategorieHinweis")}
        </div>
      )}
    </Modal>
  );
}

