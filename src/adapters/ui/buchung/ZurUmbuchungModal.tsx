// Zur Umbuchung machen (S-1) — aus einer gebuchten Zeile ein Umbuchungs-Bein machen.
//
// Eigene Datei aus demselben Grund wie `SplitModal`: ein Dialog, der vom Buchungsformular
// aus geoeffnet wird, aber nichts von dessen Zustand braucht.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { istAktiv, type IstBuchung, type Zahlungskonto } from "../../../application";
import type { Umsatz } from "../../../application/import";
import { paarungsKandidaten, MAX_VORSCHLAG_TAGE } from "../../../application/buchung/umbuchungAusBuchung";
import { buchungenPaaren, gegenbeinErzeugen } from "../../dienste";
import { Auswahl } from "../bausteine/Auswahl";
import { Button } from "../bausteine";
import { Modal } from "../bausteine/Modal";
import { fehlerNachricht, useDatum, useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";
import { Option, Optionsgruppe } from "./Optionsgruppe";
import { Trenner } from "../bausteine/Anordnung";

/**
 * S-1 — macht aus einer bestehenden Buchung eine Umbuchung. EIN Dialog für beide Fälle:
 * oben die passenden Gegenbuchungen (S-1b, nachträgliche Paarung), darunter der Ausweg
 * „Gegenbein neu erzeugen" (S-1a, Zielkonto wird nicht importiert). Der Nutzer soll nicht
 * vorher wissen müssen, welcher Fall vorliegt — die Liste beantwortet das.
 */
export function ZurUmbuchungModal({ buchung, konten, onlineKonten, alleBuchungen, kontoName, umsatzByIst, onClose, onSaved }: { buchung: IstBuchung; konten: Zahlungskonto[]; onlineKonten: ReadonlySet<string>; alleBuchungen: IstBuchung[]; kontoName: Map<string, string>; umsatzByIst: Map<string, Umsatz>; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const datum = useDatum();
  const kandidaten = useMemo(() => paarungsKandidaten(alleBuchungen, buchung), [alleBuchungen, buchung]);
  // Erzeugt wird nur auf Konten ohne Bankverbindung — siehe `gegenbeinErzeugen`. Die
  // Gegenbuchungen darüber sind davon nicht betroffen: die existieren schon.
  // Wie im Buchungsdialog: hier wird ein Gegenbein ERZEUGT, also kommt kein stillgelegtes
  // Konto in Frage — es steht nichts schon dran, das man stehenlassen müsste.
  const andereKonten = konten.filter(
    (k) => k.id !== buchung.kontoId && !onlineKonten.has(k.id) && istAktiv(k),
  );
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
        <Button variant="link" onClick={onClose}>{t("konten.abbrechen")}</Button>
        {fehler && <span className="err">{fehler}</span>}
      </>}
    >
      {/* Die Buchung, um die es geht */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap", padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--surface-2, var(--accent-wash))", marginBottom: "var(--sp-4)" }}>
        <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semi)" }}>
          {datum.ohneJahr(buchung.datum)} · {kandidatLabel(buchung) || kontoName.get(buchung.kontoId) || ""}
        </span>
        <span className="num" style={{ fontWeight: 700, color: geldFarbe(buchung.betrag) }}>
          {geld.formatMitSymbol(buchung.betrag, { mitVorzeichen: true })}
        </span>
      </div>

      <div style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)", marginBottom: 8 }}>
        {t("konten.zurUmbuchung.kandidatenTitel")}
      </div>
      {/* Die Gruppe umschliesst Kandidaten UND den Ausweg: es ist eine Frage („welche
          Gegenseite?"), und die Pfeiltasten laufen über alle Antworten. Die Spalte mit
          Abstand nimmt die Abstände des Dialoginhalts mit, in dem die Zeilen vorher
          unmittelbar standen. */}
      <Optionsgruppe
        wert={wahl}
        aufAendern={setWahl}
        label={t("konten.zurUmbuchung.kandidatenTitel")}
        style={{ display: "flex", flexDirection: "column", gap: 15 }}
      >
      {kandidaten.length === 0 ? (
        <div className="hinweis">{t("konten.zurUmbuchung.keineKandidaten", { tage: MAX_VORSCHLAG_TAGE })}</div>
      ) : (
        kandidaten.map((k) => (
          <Option key={k.id} wert={k.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line-soft)" }}>
            <span style={{ fontSize: "var(--fs-2xs)", fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{datum.ohneJahr(k.datum)}</span>
            <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semi)", flex: 1, minWidth: 0 }}>
              {kontoName.get(k.kontoId) ?? "?"}
              {kandidatLabel(k) && <span className="muted" style={{ marginLeft: 8, fontSize: "var(--fs-xs)" }}>{kandidatLabel(k)}</span>}
            </span>
            <span className="num" style={{ fontWeight: 700, color: geldFarbe(k.betrag) }}>{geld.formatMitSymbol(k.betrag, { mitVorzeichen: true })}</span>
          </Option>
        ))
      )}

      {/* Ausweg: kein Gegenbein vorhanden (S-1a).

          Fällt ganz weg, wenn alle übrigen Konten an einer Bank hängen — dort darf nichts
          erzeugt werden, und ein Radio-Knopf über einer leeren Auswahlliste wäre eine
          Handlung, die nicht geht. Statt dessen steht dort, warum: die Gegenseite meldet
          die Bank ohnehin, sie muss nur verbunden werden. */}
      {andereKonten.length > 0 ? (
        <>
          <Trenner text={t("konten.zurUmbuchung.oder")} style={{ margin: "var(--sp-4) 0 var(--sp-3)" }} />
          <Option wert="__neu" style={{ display: "flex", gap: 10 }}>
            <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-semi)" }}>{t("konten.zurUmbuchung.neu")}</span>
            <span style={{ minWidth: 180 }}>
              <Auswahl
                ariaLabel={t("konten.zurUmbuchung.neu")}
                wert={neuKontoId}
                aufAenderung={(v) => { setNeuKontoId(v); setWahl("__neu"); }}
                optionen={andereKonten.map((k) => ({ wert: k.id, text: k.bezeichnung }))}
              />
            </span>
          </Option>
          <div className="hinweis" style={{ marginTop: 6 }}>{t("konten.zurUmbuchung.neuHinweis")}</div>
        </>
      ) : (
        <div className="hinweis" style={{ marginTop: "var(--sp-4)" }}>
          {t("konten.zurUmbuchung.nurVerbinden")}
        </div>
      )}
      </Optionsgruppe>

      {buchung.kategorieId && (
        <div className="hinweis" style={{ marginTop: "var(--sp-3)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line-soft)" }}>
          {t("konten.zurUmbuchung.kategorieHinweis")}
        </div>
      )}
    </Modal>
  );
}

