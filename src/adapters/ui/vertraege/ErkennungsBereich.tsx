// Die Erkennung eines Vertrags — jetzt IM Vertragsdialog statt in einer eigenen Maske.
//
// Sie stand bis hierher hinter einem eigenen Knopf in der Vertragsliste, und das war
// zweimal falsch. Zum einen ist „woran wird das erkannt" keine Frage neben dem Vertrag,
// sondern eine ueber ihn — wer den Betrag aendert, muss die Betragsspanne im selben
// Atemzug sehen koennen, sonst faellt der Vertrag nach dem Speichern aus seiner eigenen
// Regel. Zum anderen fand sie niemand: ein Icon in einer Zeile ist kein Ort, an dem man
// nach den Eigenschaften eines Vertrags sucht.
//
// ## Die Merkmale sind eine LISTE, kein Textblock
//
// Vorher standen sie in drei Textfeldern, je ein Muster pro Zeile, getrennt nach Art.
// Das ist zu schreiben bequem und zu lesen nutzlos: man sieht drei Kaesten mit Text und
// nicht, WORAUS die Regel besteht. Vor allem sieht man nicht, was jedes einzelne Muster
// beitraegt — und genau das ist die Auskunft, an der alles haengt.
//
// **Jede Zeile sagt deshalb, wie viele Zahlungen sie fuer sich allein trifft.** Eine
// Null ist dabei der wichtigste Wert, den diese Maske anzeigen kann: sie heisst, dass
// dieses Muster noch nie etwas gefunden hat und die Regel in Wahrheit an einem einzigen
// anderen Merkmal haengt. Faellt dessen Feld eines Tages aus — weil die Bank das
// Abrufformat wechselt und die Glaeubiger-ID nicht mehr mitliefert —, hoert der Vertrag
// ohne jede Meldung auf zu greifen. Genau so ist es passiert, und in der alten Maske war
// es nicht zu sehen: dort stand ein Empfaengername neben einer ID, beide sahen gleich
// gueltig aus, und nur eine von beiden hat je gearbeitet.
//
// ## Was es NICHT gibt: die ganze Regel loeschen
//
// Es waere ein Knopf, der nichts bewirkt. `erkennungenNachziehen` legt beim naechsten
// Oeffnen des Vertragsbereichs fuer jeden Vertrag OHNE Regel die Standardregel wieder an
// — die geloeschte kaeme also zurueck, nur mit anderem Inhalt. Wer die Erkennung
// abstellen will, leert die Merkmalsliste: eine Regel ohne Merkmal trifft nichts
// (`passtZu` verlangt mindestens einen Treffer), und dieser Zustand bleibt stehen.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  anbieterSchluessel,
  musterTrifft,
  minorZuMajor,
  MERKMALSARTEN,
  type Erkennungsmerkmal,
  type Erkennungsprobe,
  type Merkmalsart,
  type Vertragserkennung,
  type Waehrung,
  type Zahlungskonto,
} from "../../../application";
import { FormField, Pill } from "../bausteine";
import { IconButton } from "../bausteine/IconButton";
import { Auswahl } from "../bausteine/Auswahl";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { useGeld } from "../bausteine/einstellungenKontext";

/** Wie viele Treffer die Vorschau einzeln auflistet — der Rest wird gezaehlt. */
const VORSCHAU_ZEILEN = 8;

/**
 * Der Formularzustand der Erkennung. Betraege als TEXT, wie ueberall: solange getippt
 * wird, ist „1,2" ein legitimer Zwischenstand, den kein Cent-Integer abbilden kann.
 *
 * Die Merkmale stehen dagegen schon als Merkmale drin und nicht als Text — sie werden
 * zeilenweise bearbeitet, nicht am Stueck getippt, und ein Zwischenstand, der sich nicht
 * abbilden laesst, gibt es dort nicht.
 */
export interface ErkennungFormular {
  merkmale: Erkennungsmerkmal[];
  betragVonText: string;
  betragBisText: string;
  gueltigAb: string;
  gueltigBis: string;
  kontoId: string;
}

/** Bestehende Regel → Maske. Fehlt sie, ist die Maske leer statt gar nicht da. */
export function erkennungAusRegel(
  e: Vertragserkennung | undefined,
  waehrung: Waehrung,
): ErkennungFormular {
  const zahl = (c?: number) => (c === undefined ? "" : String(minorZuMajor(c, waehrung)));
  return {
    merkmale: [...(e?.merkmale ?? [])],
    betragVonText: zahl(e?.betragVon),
    betragBisText: zahl(e?.betragBis),
    gueltigAb: e?.gueltigAb ?? "",
    gueltigBis: e?.gueltigBis ?? "",
    kontoId: e?.kontoId ?? "",
  };
}

/**
 * Maske → Regel. Leere Felder werden zu `undefined`, also „keine Einschraenkung".
 *
 * Leere Muster fallen raus: eine frisch hinzugefuegte, noch nicht ausgefuellte Zeile ist
 * ein Bedienzustand und kein Merkmal. Stuende sie in der Regel, traefe sie nichts und
 * die Vorschau meldete waehrend des Tippens einen Einbruch, der keiner ist.
 */
export function regelAusErkennung(
  vertragId: string,
  f: ErkennungFormular,
  parse: (text: string) => number | null,
): Vertragserkennung {
  return {
    vertragId,
    merkmale: f.merkmale
      .map((m) => ({ art: m.art, muster: m.muster.trim() }))
      .filter((m) => m.muster.length > 0),
    betragVon: parse(f.betragVonText) ?? undefined,
    betragBis: parse(f.betragBisText) ?? undefined,
    gueltigAb: f.gueltigAb || undefined,
    gueltigBis: f.gueltigBis || undefined,
    kontoId: f.kontoId || undefined,
  };
}

export function ErkennungsBereich({
  anbieter,
  konten,
  f,
  aufAenderung,
  probe,
}: {
  /** Der Anbietername aus der LAUFENDEN Maske — wer ihn gerade aendert, soll den neuen
      angeboten bekommen und nicht den gespeicherten. */
  anbieter: string;
  konten: readonly Zahlungskonto[];
  f: ErkennungFormular;
  aufAenderung: (f: ErkennungFormular) => void;
  probe: Erkennungsprobe;
}) {
  const { t } = useTranslation();
  const geld = useGeld();

  function setze<K extends keyof ErkennungFormular>(feld: K, wert: ErkennungFormular[K]) {
    aufAenderung({ ...f, [feld]: wert });
  }

  function merkmalSetzen(i: number, teil: Partial<Erkennungsmerkmal>) {
    setze("merkmale", f.merkmale.map((m, k) => (k === i ? { ...m, ...teil } : m)));
  }

  function merkmalEntfernen(i: number) {
    setze("merkmale", f.merkmale.filter((_, k) => k !== i));
  }

  /**
   * Den Anbieternamen als Empfaenger-Muster anbieten — aber nur, wenn ihn wirklich noch
   * keins abdeckt.
   *
   * Geprueft wird mit `musterTrifft` und NICHT auf Gleichheit. Der Unterschied ist nicht
   * theoretisch: seit `standardErkennung` den Stern anhaengt, steht in der Regel
   * `anthropic*` und nicht `anthropic` — ein Gleichheitsvergleich fand das nie und der
   * Dialog bot bei JEDEM Vertrag an, etwas zu ergaenzen, das laengst dasteht.
   */
  const nameSchluessel = anbieterSchluessel(anbieter);
  const nameMuster = nameSchluessel ? `${nameSchluessel}*` : "";
  const nameFehlt =
    !!nameSchluessel &&
    !f.merkmale.some((m) => m.art === "empfaenger" && musterTrifft(m.muster.trim(), nameSchluessel));

  /** Die Stufe, die am meisten weggenommen hat — nur wenn es ueberhaupt eine gibt. */
  const engstelle = useMemo(() => {
    const d = probe.diagnose;
    if (!d) return null;
    const stufen = [
      { schluessel: "merkmale", vorher: d.grundmenge, nachher: d.nachMerkmalen },
      { schluessel: "betrag", vorher: d.nachMerkmalen, nachher: d.nachBetrag },
      { schluessel: "zeitraum", vorher: d.nachBetrag, nachher: d.nachZeitraum },
      { schluessel: "konto", vorher: d.nachZeitraum, nachher: d.nachKonto },
    ].filter((x) => x.vorher > x.nachher);
    if (stufen.length === 0) return null;
    return stufen.reduce((a, b) => (b.vorher - b.nachher > a.vorher - a.nachher ? b : a));
  }, [probe.diagnose]);

  const treffer = probe.treffer;

  return (
    <>
      <p className="muted" style={{ fontSize: "var(--fs-small)", margin: "0 0 var(--sp-3)", maxWidth: 640 }}>
        {t("vertraege.regel.hinweis")}
      </p>

      {/* Die Merkmale, eines je Zeile. Art und Muster stehen nebeneinander, weil die Art
          die Bedeutung des Musters aendert: dieselbe Zeichenkette meint als Empfaenger
          etwas anderes als im Verwendungszweck. */}
      <FormField label={t("vertraege.regel.merkmale")} hint={t("vertraege.regel.merkmaleHinweis")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {f.merkmale.length === 0 && (
            <div className="muted" style={{ fontSize: "var(--fs-xs)" }}>
              {t("vertraege.regel.ohneMerkmale")}
            </div>
          )}
          {f.merkmale.map((m, i) => {
            // Die Trefferzahl steht in derselben Reihenfolge wie die Merkmale — aber nur
            // fuer die NICHT leeren, weil `regelAusErkennung` leere herauswirft. Deshalb
            // wird ueber das Muster zugeordnet und nicht ueber den Index.
            const zahl = probe.proMerkmal.find(
              (x) => x.merkmal.art === m.art && x.merkmal.muster === m.muster.trim(),
            )?.trifft;
            return (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <Auswahl
                  ariaLabel={t("vertraege.regel.merkmalArt")}
                  wert={m.art}
                  aufAenderung={(v) => merkmalSetzen(i, { art: v as Merkmalsart })}
                  optionen={MERKMALSARTEN.map((a) => ({ wert: a, text: t(`vertraege.regel.art.${a}`) }))}
                />
                <input
                  className="field"
                  aria-label={t("vertraege.regel.merkmalMuster")}
                  style={{ flex: "1 1 180px", minWidth: 0, fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
                  value={m.muster}
                  placeholder={t("vertraege.regel.musterPlatzhalter")}
                  onChange={(e) => merkmalSetzen(i, { muster: e.target.value })}
                />
                {/* Die Zahl je Zeile — der eigentliche Zugewinn dieser Maske. Null wird
                    gewarnt und nicht bloss angezeigt: ein Muster, das nie trifft, sieht
                    sonst genauso gueltig aus wie eins, das die ganze Arbeit macht. */}
                {m.muster.trim() !== "" && zahl !== undefined && (
                  <span
                    style={{ flex: "0 0 auto" }}
                    title={zahl === 0 ? t("vertraege.regel.merkmalTrifftNieHinweis") : undefined}
                  >
                    <Pill variant={zahl === 0 ? "warn" : "neutral"}>
                      {zahl === 0
                        ? t("vertraege.regel.merkmalTrifftNie")
                        : t("vertraege.regel.merkmalTrifft", { count: zahl })}
                    </Pill>
                  </span>
                )}
                <IconButton
                  icon="loeschen"
                  label={t("vertraege.regel.merkmalEntfernen")}
                  onClick={() => merkmalEntfernen(i)}
                />
              </div>
            );
          })}
          <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", marginTop: 2 }}>
            <button
              className="linkbtn"
              style={{ padding: 0 }}
              onClick={() => setze("merkmale", [...f.merkmale, { art: "empfaenger", muster: "" }])}
            >
              {t("vertraege.regel.merkmalHinzufuegen")}
            </button>
            {nameFehlt && (
              <button
                className="linkbtn"
                style={{ padding: 0 }}
                onClick={() => setze("merkmale", [...f.merkmale, { art: "empfaenger", muster: nameMuster }])}
              >
                {t("vertraege.regel.nameHinzufuegen", { name: nameMuster })}
              </button>
            )}
          </div>
        </div>
      </FormField>

      {/* Die Einschraenkungen. Sie stehen UNTER den Merkmalen, weil sie in der Kette
          dahinter greifen — und weil die Engstelle darunter genau diese Reihenfolge
          benennt. */}
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

      {/* Die Spanne an das anpassen, was tatsaechlich da ist. Die Betragsstufe ist die,
          an der eine Regel am haeufigsten zu viel wegnimmt: `standardErkennung` leitet
          sie aus EINEM Betrag ab, was fuer eine feste Rate stimmt und fuer alles
          Schwankende nicht. Der Knopf erscheint nur, wenn die Stufe wirklich etwas
          wegnimmt. */}
      {probe.spanne && (
        <button
          className="linkbtn"
          style={{ marginTop: "var(--sp-2)" }}
          onClick={() => {
            aufAenderung({
              ...f,
              betragVonText: String(minorZuMajor(probe.spanne!.von, geld.waehrung)),
              betragBisText: String(minorZuMajor(probe.spanne!.bis, geld.waehrung)),
            });
          }}
        >
          {t("vertraege.regel.spanneAnpassen", {
            von: geld.formatMitSymbol(probe.spanne.von),
            bis: geld.formatMitSymbol(probe.spanne.bis),
          })}
        </button>
      )}

      {/* Vorschau — der Grund, warum diese Maske ueberhaupt bedienbar ist. */}
      <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 8 }}>
          <Pill variant={treffer.length > 0 ? "ok" : "warn"}>
            {t("vertraege.regel.treffer", { count: treffer.length })}
          </Pill>
          <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
            {t("vertraege.regel.trefferHinweis")}
          </span>
        </div>

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
    </>
  );
}
