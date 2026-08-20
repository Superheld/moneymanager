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
  erkennungProbieren,
  type Erkennungsmerkmal,
  type Merkmalsart,
  type Waehrung,
  type Vertrag,
  type Vertragserkennung,
  type Zahlungskonto,
  type Zahlungsspur,
} from "../../../application";
import {
  spuren as spurenLaden,
  stammdaten,
  vertragserkennungen,
  vertragserkennungSpeichern,
  vertragszuordnungenAbgleichen,
} from "../../dienste";
import { Button, FormField, Pill } from "../bausteine";
import { Modal } from "../bausteine/Modal";
import { useGeld, fehlerNachricht } from "../bausteine/einstellungenKontext";

/** Wie viele Treffer die Vorschau einzeln auflistet — der Rest wird gezählt. */
const VORSCHAU_ZEILEN = 8;

/**
 * Der Formularzustand. Beträge als TEXT, wie überall: solange getippt wird, ist „1,2"
 * ein legitimer Zwischenstand, den kein Cent-Integer abbilden kann.
 */
interface RegelFormular {
  /** Ein Empfänger-Muster je Zeile. */
  empfaengerText: string;
  /** Eine Gläubiger-ID je Zeile. */
  glaeubigerText: string;
  betragVonText: string;
  betragBisText: string;
  gueltigAb: string;
  gueltigBis: string;
  kontoId: string;
}

/** Die Muster einer Art, eines je Zeile. */
function zeilen(e: Vertragserkennung | undefined, art: Merkmalsart): string {
  return (e?.merkmale ?? []).filter((m) => m.art === art).map((m) => m.muster).join("\n");
}

/** Textblock → Merkmale einer Art; leere Zeilen fallen weg. */
function ausZeilen(text: string, art: Merkmalsart): Erkennungsmerkmal[] {
  return text
    .split("\n")
    .map((z) => z.trim())
    .filter(Boolean)
    .map((muster) => ({ art, muster }));
}

function ausRegel(e: Vertragserkennung | undefined, waehrung: Waehrung): RegelFormular {
  const zahl = (c?: number) => (c === undefined ? "" : String(minorZuMajor(c, waehrung)));
  return {
    empfaengerText: zeilen(e, "empfaenger"),
    glaeubigerText: zeilen(e, "glaeubigerId"),
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
        vertragserkennungen(),
        spurenLaden(),
        stammdaten().then((d) => [...d.konten]),
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
    return {
      vertragId: vertrag.id,
      merkmale: [
        ...ausZeilen(f.glaeubigerText, "glaeubigerId"),
        ...ausZeilen(f.empfaengerText, "empfaenger"),
      ],
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
  const probe = useMemo(() => erkennungProbieren(regel, spuren), [regel, spuren]);
  const treffer = probe.treffer;

  /**
   * Wo die Kette abreisst.
   *
   * Ohne diese Aufschlüsselung war die Vorschau bei null Treffern stumm: das Muster
   * konnte passen und trotzdem verschwand alles an der Betragsspanne, die
   * `standardErkennung` beim Anlegen mitgibt. Wer dann `*ard*` tippte und nichts sah,
   * kam zu dem Schluss, dass Platzhalter nicht funktionieren. Sie tun es — nur ein
   * Filter dahinter räumte auf.
   */
  const diagnose = probe.diagnose;

  /** Die Stufe, die am meisten weggenommen hat — nur wenn es überhaupt eine gibt. */
  const engstelle = useMemo(() => {
    if (!diagnose) return null;
    const stufen = [
      { schluessel: "merkmale", vorher: diagnose.grundmenge, nachher: diagnose.nachMerkmalen },
      { schluessel: "betrag", vorher: diagnose.nachMerkmalen, nachher: diagnose.nachBetrag },
      { schluessel: "zeitraum", vorher: diagnose.nachBetrag, nachher: diagnose.nachZeitraum },
      { schluessel: "konto", vorher: diagnose.nachZeitraum, nachher: diagnose.nachKonto },
    ].filter((x) => x.vorher > x.nachher);
    if (stufen.length === 0) return null;
    return stufen.reduce((a, b) => (b.vorher - b.nachher > a.vorher - a.nachher ? b : a));
  }, [diagnose]);

  async function speichern() {
    if (!regel) return;
    setFehler(null);
    try {
      await vertragserkennungSpeichern(regel);
      // Die geänderte Regel wirkt erst, wenn neu gerechnet wird — und sie kann Zuordnungen
      // auch WEGnehmen (engere Spanne, Stichtag). Beides macht der Abgleich.
      await vertragszuordnungenAbgleichen();
      await onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  /** Den normalisierten Anbieternamen als Empfänger-Muster anbieten, wenn er fehlt. */
  const nameSchluessel = anbieterSchluessel(vertrag.anbieter);
  const nameFehlt =
    !!f && !!nameSchluessel && !regel?.merkmale.some((m) => m.muster === nameSchluessel);

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
          {/* Empfänger und Gläubiger-ID getrennt: einem Eintrag in einer gemischten Liste
              war nicht anzusehen, als was er gemeint war — und die Vorrangregel bei
              mehreren Treffern hing damit an einer Vermutung statt an einer Angabe. */}
          <FormField label={t("vertraege.regel.empfaenger")} hint={t("vertraege.regel.empfaengerHinweis")}>
            <textarea
              className="field"
              aria-label={t("vertraege.regel.empfaenger")}
              rows={Math.max(2, f.empfaengerText.split("\n").length)}
              style={{ width: "100%", fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
              value={f.empfaengerText}
              onChange={(e) => setze("empfaengerText", e.target.value)}
            />
          </FormField>
          {nameFehlt && (
            <button
              className="linkbtn"
              style={{ marginBottom: "var(--sp-3)" }}
              onClick={() => setze("empfaengerText", `${f.empfaengerText}\n${nameSchluessel}`.trim())}
            >
              {t("vertraege.regel.nameHinzufuegen", { name: nameSchluessel })}
            </button>
          )}

          <FormField label={t("vertraege.regel.glaeubiger")} hint={t("vertraege.regel.glaeubigerHinweis")} style={{ marginTop: "var(--sp-3)" }}>
            <textarea
              className="field"
              aria-label={t("vertraege.regel.glaeubiger")}
              rows={Math.max(1, f.glaeubigerText.split("\n").length)}
              style={{ width: "100%", fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
              value={f.glaeubigerText}
              onChange={(e) => setze("glaeubigerText", e.target.value)}
            />
          </FormField>

          <div className="form-grid" style={{ marginTop: "var(--sp-3)" }}>
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

            {/* Wo die Kette abreisst — nur zeigen, wenn wirklich etwas verlorengeht. */}
            {engstelle && (
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginBottom: 8 }}>
                {t(`vertraege.regel.engstelle.${engstelle.schluessel}`, {
                  weg: engstelle.vorher - engstelle.nachher,
                  uebrig: engstelle.nachher,
                })}
              </div>
            )}

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
