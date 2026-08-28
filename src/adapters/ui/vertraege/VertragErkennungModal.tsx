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

import { Auswahl } from "../bausteine/Auswahl";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  anbieterSchluessel,
  musterTrifft,
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
  zweckText: string;
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
    zweckText: zeilen(e, "verwendungszweck"),
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
        ...ausZeilen(f.zweckText, "verwendungszweck"),
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

  /**
   * Den Anbieternamen als Empfänger-Muster anbieten — aber nur, wenn ihn wirklich noch
   * keins abdeckt.
   *
   * Geprüft wird mit `musterTrifft` und NICHT auf Gleichheit. Der Unterschied ist nicht
   * theoretisch: seit `standardErkennung` den Stern anhängt, steht in der Regel
   * `anthropic*` und nicht `anthropic` — ein Gleichheitsvergleich fand ihn nie mehr und
   * der Dialog bot bei JEDEM Vertrag an, etwas zu ergänzen, das längst dasteht. Ein Klick
   * darauf hätte ein zweites, engeres Muster danebengesetzt.
   *
   * Angeboten wird die Form MIT Stern, aus demselben Grund, aus dem die Vorbelegung sie
   * hat: Empfängerfelder tragen Produktnamen, Rechnungs- und Ortsangaben hinter dem
   * Anbieter.
   */
  const nameSchluessel = anbieterSchluessel(vertrag.anbieter);
  const nameMuster = nameSchluessel ? `${nameSchluessel}*` : "";
  const nameFehlt =
    !!f &&
    !!nameSchluessel &&
    !regel?.merkmale.some((m) => m.art === "empfaenger" && musterTrifft(m.muster, nameSchluessel));

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
              onClick={() => setze("empfaengerText", `${f.empfaengerText}\n${nameMuster}`.trim())}
            >
              {t("vertraege.regel.nameHinzufuegen", { name: nameMuster })}
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

          {/* Der Verwendungszweck — ein NACHTRAG und bewusst leer vorbelegt.
              Vorgabe bleibt: ein Vertrag hängt am Empfänger, nicht am Text, und
              `standardErkennung` legt hier nie etwas an. Als Decke stimmte das aber
              nicht: bei einer Dauerüberweisung an eine Privatperson steht im
              Empfängerfeld ein Name, der über den Vertrag nichts sagt, und die einzige
              unterscheidende Angabe steht im Zweck. */}
          <FormField label={t("vertraege.regel.zweck")} hint={t("vertraege.regel.zweckHinweis")} style={{ marginTop: "var(--sp-3)" }}>
            <textarea
              className="field"
              aria-label={t("vertraege.regel.zweck")}
              rows={Math.max(1, f.zweckText.split("\n").length)}
              style={{ width: "100%", fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
              value={f.zweckText}
              onChange={(e) => setze("zweckText", e.target.value)}
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
              <Datumsfeld ariaLabel={t("vertraege.regel.gueltigAb")}
                wert={f.gueltigAb} aufAenderung={(v) => setze("gueltigAb", v)} />
            </FormField>
            <FormField label={t("vertraege.regel.gueltigBis")}>
              <Datumsfeld ariaLabel={t("vertraege.regel.gueltigBis")}
                wert={f.gueltigBis} aufAenderung={(v) => setze("gueltigBis", v)} />
            </FormField>
            <FormField label={t("vertraege.regel.konto")}>
              <Auswahl
                ariaLabel={t("vertraege.regel.konto")}
                wert={f.kontoId}
                aufAenderung={(v) => setze("kontoId", v)}
                optionen={[
                  { wert: "", text: t("vertraege.regel.alleKonten") },
                  ...konten.map((k) => ({ wert: k.id, text: k.bezeichnung })),
                ]}
              />
            </FormField>
          </div>

          {/* Die Spanne an das anpassen, was tatsächlich da ist.
              Die Betragsstufe ist die, an der eine Regel am häufigsten zu viel wegnimmt:
              `standardErkennung` leitet sie aus EINEM Betrag ab (0,6× bis 1,8×), was für
              eine feste Rate stimmt und für alles Schwankende nicht — Verbrauch,
              Fremdwährung, Abos mit wechselndem Umfang. Die Diagnose darunter sagte schon
              immer, DASS der Betrag die Engstelle ist; sie konnte nur nicht sagen, welche
              Spanne stattdessen passt. Der Knopf erscheint deshalb auch nur dann. */}
          {probe.spanne && (
            <button
              className="linkbtn"
              style={{ marginTop: "var(--sp-2)" }}
              onClick={() => {
                setze("betragVonText", String(minorZuMajor(probe.spanne!.von, geld.waehrung)));
                setze("betragBisText", String(minorZuMajor(probe.spanne!.bis, geld.waehrung)));
              }}
            >
              {t("vertraege.regel.spanneAnpassen", {
                von: geld.formatMitSymbol(probe.spanne.von),
                bis: geld.formatMitSymbol(probe.spanne.bis),
              })}
            </button>
          )}

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
