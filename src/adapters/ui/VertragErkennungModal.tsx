// Die Erkennungsregel eines Vertrags — einsehen und nachsteuern.
//
// Warum das eine eigene Maske ist und nicht ein Feld in der Vertragsmaske: hier steht
// nichts über den Vertrag, sondern darüber, WORAN seine Zahlungen zu erkennen sind. Das
// muss man anfassen können, wenn die Automatik danebenliegt — der Preis ist gestiegen,
// der Anbieter schreibt sich seit dem Umzug anders, ein Vorgängervertrag lief unter
// demselben Namen und soll ab einem Stichtag nicht mehr mitzählen.
//
// Der wichtigste Teil ist nicht das Formular, sondern die VORSCHAU darunter: sie zeigt
// bei jeder Änderung sofort, welche Buchungen die Regel gerade trifft. Ohne sie wäre
// jede Anpassung ein Blindflug — man dreht an einer Betragsgrenze und erfährt erst nach
// dem Speichern, ob man zu viel oder zu wenig eingefangen hat.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  anbieterSchluessel,
  minorZuMajor,
  passtZu,
  type Waehrung,
  type Vertrag,
  type Vertragserkennung,
  type Zahlungskonto,
  type Zahlungsspur,
} from "../../core";
import { zahlungsspuren } from "../../application/zahlungsspuren";
import { zuordnungenAbgleichen } from "../../application/vertragszuordnung";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import { sqliteUmsatzRepository as umsatzRepo } from "../persistence/sqliteImportRepositories";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import {
  sqliteVertragserkennungRepository as erkennungRepo,
  vertragsAbgleichDeps,
} from "../persistence/sqliteVertragZuordnungRepositories";
import { Button, FormField, Pill } from "./ds";
import { Modal } from "./Modal";
import { useGeld, fehlerNachricht } from "./einstellungenKontext";

/** Wie viele Treffer die Vorschau einzeln auflistet — der Rest wird gezählt. */
const VORSCHAU_ZEILEN = 8;

/**
 * Der Formularzustand. Beträge als TEXT, wie überall: solange getippt wird, ist „1,2"
 * ein legitimer Zwischenstand, den kein Cent-Integer abbilden kann.
 */
interface RegelFormular {
  /** Ein Schlüssel je Zeile — Gläubiger-IDs und normalisierte Namen gemischt. */
  schluesselText: string;
  betragVonText: string;
  betragBisText: string;
  gueltigAb: string;
  gueltigBis: string;
  kontoId: string;
}

function ausRegel(e: Vertragserkennung | undefined, waehrung: Waehrung): RegelFormular {
  const zahl = (c?: number) => (c === undefined ? "" : String(minorZuMajor(c, waehrung)));
  return {
    schluesselText: (e?.schluessel ?? []).join("\n"),
    betragVonText: zahl(e?.betragVon),
    betragBisText: zahl(e?.betragBis),
    gueltigAb: e?.gueltigAb ?? "",
    gueltigBis: e?.gueltigBis ?? "",
    kontoId: e?.kontoId ?? "",
  };
}

export function VertragErkennungModal({
  vertrag,
  onClose,
  onSaved,
}: {
  vertrag: Vertrag;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [f, setF] = useState<RegelFormular | null>(null);
  const [spuren, setSpuren] = useState<Zahlungsspur[]>([]);
  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [alleRegeln, sp, ks] = await Promise.all([
        erkennungRepo.alle(),
        zahlungsspuren(ledgerRepo, umsatzRepo),
        kontoRepo.alle(),
      ]);
      setF(ausRegel(alleRegeln.find((e) => e.vertragId === vertrag.id), geld.waehrung));
      setSpuren(sp);
      setKonten(ks);
    })();
  }, [vertrag.id]);

  function setze<K extends keyof RegelFormular>(feld: K, wert: RegelFormular[K]) {
    setF((v) => (v ? { ...v, [feld]: wert } : v));
  }

  /** Formular → Regel. Leere Felder werden zu `undefined`, also „keine Einschränkung". */
  const regel: Vertragserkennung | null = useMemo(() => {
    if (!f) return null;
    const schluessel = f.schluesselText
      .split("\n")
      .map((z) => z.trim())
      .filter(Boolean);
    return {
      vertragId: vertrag.id,
      schluessel,
      betragVon: geld.parse(f.betragVonText) ?? undefined,
      betragBis: geld.parse(f.betragBisText) ?? undefined,
      gueltigAb: f.gueltigAb || undefined,
      gueltigBis: f.gueltigBis || undefined,
      kontoId: f.kontoId || undefined,
    };
  }, [f, vertrag.id, geld]);

  /**
   * Was die Regel im aktuellen Zustand trifft — live, ohne Speichern. Neueste zuerst:
   * beim Nachsteuern interessiert der jüngste Stand, nicht der Anfang der Reihe.
   */
  const treffer = useMemo(() => {
    if (!regel || regel.schluessel.length === 0) return [];
    return spuren
      .filter((s) => passtZu(regel, s))
      .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
  }, [regel, spuren]);

  async function speichern() {
    if (!regel) return;
    setFehler(null);
    try {
      await erkennungRepo.speichern(regel);
      // Die geänderte Regel wirkt erst, wenn neu gerechnet wird — und sie kann Zuordnungen
      // auch WEGnehmen (engere Spanne, Stichtag). Beides macht der Abgleich.
      await zuordnungenAbgleichen(vertragsAbgleichDeps);
      await onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  /** Den normalisierten Anbieternamen als Schlüssel anbieten, wenn er fehlt. */
  const nameSchluessel = anbieterSchluessel(vertrag.anbieter);
  const nameFehlt = !!f && !!nameSchluessel && !regel?.schluessel.includes(nameSchluessel);

  return (
    <Modal
      title={t("vertraege.regel.titel")}
      subtitle={vertrag.anbieter}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={speichern}>{t("vertraege.speichern")}</Button>
          <button className="linkbtn" onClick={onClose}>{t("vertraege.abbrechen")}</button>
        </>
      }
    >
      {fehler && <div style={{ color: "var(--warn-deep)", marginBottom: "var(--sp-3)" }}>{fehler}</div>}

      <p className="muted" style={{ fontSize: "var(--fs-small)", margin: "0 0 var(--sp-4)", maxWidth: 640 }}>
        {t("vertraege.regel.hinweis")}
      </p>

      {f && (
        <>
          <FormField label={t("vertraege.regel.schluessel")} hint={t("vertraege.regel.schluesselHinweis")}>
            <textarea
              className="field"
              aria-label={t("vertraege.regel.schluessel")}
              rows={Math.max(2, regel?.schluessel.length ?? 1)}
              style={{ width: "100%", fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
              value={f.schluesselText}
              onChange={(e) => setze("schluesselText", e.target.value)}
            />
          </FormField>
          {nameFehlt && (
            <button
              className="linkbtn"
              style={{ marginBottom: "var(--sp-3)" }}
              onClick={() => setze("schluesselText", `${f.schluesselText}\n${nameSchluessel}`.trim())}
            >
              {t("vertraege.regel.nameHinzufuegen", { name: nameSchluessel })}
            </button>
          )}

          <div className="form-grid">
            <FormField label={`${t("vertraege.regel.betragVon")} ${geld.symbol}`}>
              <input className="field" inputMode="decimal" aria-label={t("vertraege.regel.betragVon")}
                value={f.betragVonText} onChange={(e) => setze("betragVonText", e.target.value)} />
            </FormField>
            <FormField label={`${t("vertraege.regel.betragBis")} ${geld.symbol}`}>
              <input className="field" inputMode="decimal" aria-label={t("vertraege.regel.betragBis")}
                value={f.betragBisText} onChange={(e) => setze("betragBisText", e.target.value)} />
            </FormField>
            <FormField label={t("vertraege.regel.gueltigAb")} hint={t("vertraege.regel.zeitraumHinweis")}>
              <input className="field" type="date" aria-label={t("vertraege.regel.gueltigAb")}
                value={f.gueltigAb} onChange={(e) => setze("gueltigAb", e.target.value)} />
            </FormField>
            <FormField label={t("vertraege.regel.gueltigBis")}>
              <input className="field" type="date" aria-label={t("vertraege.regel.gueltigBis")}
                value={f.gueltigBis} onChange={(e) => setze("gueltigBis", e.target.value)} />
            </FormField>
            <FormField label={t("vertraege.regel.konto")}>
              <select className="field" aria-label={t("vertraege.regel.konto")} value={f.kontoId}
                onChange={(e) => setze("kontoId", e.target.value)}>
                <option value="">{t("vertraege.regel.alleKonten")}</option>
                {konten.map((k) => <option key={k.id} value={k.id}>{k.bezeichnung}</option>)}
              </select>
            </FormField>
          </div>

          {/* Vorschau — der Grund, warum diese Maske überhaupt bedienbar ist. */}
          <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 8 }}>
              <Pill variant={treffer.length > 0 ? "ok" : "warn"}>
                {t("vertraege.regel.treffer", { count: treffer.length })}
              </Pill>
              <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
                {t("vertraege.regel.trefferHinweis")}
              </span>
            </div>

            {treffer.slice(0, VORSCHAU_ZEILEN).map((s) => (
              <div key={s.id} style={{ display: "flex", gap: "var(--sp-3)", padding: "4px 0", alignItems: "baseline", fontSize: 13, borderBottom: "1px solid var(--line-soft)" }}>
                <span style={{ flex: "0 0 92px", color: "var(--ink-3)" }}>{s.datum}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.gegenpartei || <span className="muted">—</span>}
                </span>
                <span style={{ flex: "0 0 auto", fontWeight: "var(--fw-semi)" }}>{geld.format(s.betrag)}</span>
              </div>
            ))}
            {treffer.length > VORSCHAU_ZEILEN && (
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
                {t("vertraege.regel.weitere", { count: treffer.length - VORSCHAU_ZEILEN })}
              </div>
            )}
          </div>

          <p className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-4)", maxWidth: 640 }}>
            {t("vertraege.regel.turnusHinweis")}
          </p>
        </>
      )}
    </Modal>
  );
}
