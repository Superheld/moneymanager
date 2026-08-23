// Zwei verdächtige Zeilen NEBENEINANDER — der Dialog, an dem entschieden wird.
//
// Bisher war der Vergleich ein Gedächtnisspiel: die Markierung nennt das Datum des
// Zwillings, „Gegenstück öffnen" ERSETZT den einen Dialog durch den anderen, und wer
// wissen wollte, ob sich die beiden im Verwendungszweck unterscheiden, musste hin und her
// springen und sich den Text merken. Bei Zeilen, die ein Jahr auseinanderliegen, findet
// man den Zwilling in der Liste ohne Filter praktisch nicht wieder.
//
// Zwei Entscheidungen stecken in der Form:
//
//  1. **Zeilenweise ausgerichtet, nicht zwei Karten nebeneinander.** Zwei Detailkarten
//     nebeneinanderzustellen sieht nach Vergleich aus, ist aber keiner: sobald ein Feld
//     oben länger umbricht, stehen alle folgenden Felder versetzt, und genau die Zeile,
//     auf die es ankommt, liegt dann nicht mehr auf gleicher Höhe. Verglichen wird
//     deshalb Feld gegen Feld, in einer Zeile.
//  2. **Der Unterschied wird markiert, nicht das Gleiche.** Bei einer echten Dublette
//     stimmt fast alles überein — auffallen soll das Wenige, das abweicht. Wer die
//     Gleichheit hervorhöbe, würde den ganzen Dialog einfärben und nichts zeigen.
//
// Es gibt bewusst kein „Original" und keine „Kopie": beide Zeilen liegen im Bestand, und
// welche weg soll, entscheidet niemand automatisch. Deshalb trägt jede Spalte ihren
// eigenen Weg-Knopf, und sie stehen unter der Spalte statt im Fuss — im Fuss wäre nicht
// zu sehen, welche Zeile gemeint ist.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ABRUF_QUELLEN, type Dublettenverdacht, type IstBuchung } from "../../../application";
import type { ImportLauf, Umsatz } from "../../../application/import";
import { bankzeileVerwerfen, buchungLoeschen, dublettenFreigeben } from "../../dienste";
import { Button, Pill } from "../bausteine";
import { Modal } from "../bausteine/Modal";
import { useGeld, fehlerNachricht } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";

/** Eine Seite des Vergleichs — alles, was zu einer Zeile gehört. */
export interface Vergleichsseite {
  readonly buchung: IstBuchung;
  readonly umsatz?: Umsatz;
  readonly lauf?: ImportLauf;
  readonly kontoName: string;
  readonly kategorieName: string;
}

/** Ein Feld im Vergleich. `wert` liefert leer, wenn es die Angabe nicht gibt. */
interface Feld {
  readonly schluessel: string;
  readonly label: string;
  readonly wert: (s: Vergleichsseite) => string;
  /** Lange Freitexte brechen um statt abzuschneiden — dort steht der Unterschied. */
  readonly lang?: boolean;
}

export function DublettenVergleich({
  links,
  rechts,
  verdacht,
  onClose,
  onGeaendert,
}: {
  links: Vergleichsseite;
  rechts: Vergleichsseite;
  /** Warum die beiden als verdächtig gelten — der Grund gehört neben den Vergleich. */
  verdacht?: Dublettenverdacht;
  onClose: () => void;
  onGeaendert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const felder: Feld[] = useMemo(
    () => [
      { schluessel: "datum", label: t("konten.spalteDatum"), wert: (s) => s.buchung.datum },
      { schluessel: "valuta", label: t("konten.vergleich.valuta"), wert: (s) => s.umsatz?.valuta ?? "" },
      { schluessel: "empfaenger", label: t("konten.detail.empfaenger"), wert: (s) => s.umsatz?.gegenpartei ?? "" },
      { schluessel: "zweck", label: t("konten.detail.zweck"), wert: (s) => s.umsatz?.verwendungszweck ?? "", lang: true },
      { schluessel: "notiz", label: t("konten.feldBezeichnung"), wert: (s) => s.buchung.notiz ?? "", lang: true },
      { schluessel: "kategorie", label: t("konten.spalteKategorie"), wert: (s) => s.kategorieName },
      { schluessel: "konto", label: t("konten.detail.konto"), wert: (s) => s.kontoName },
      {
        schluessel: "herkunft",
        label: t("konten.detail.importlauf"),
        wert: (s) =>
          s.lauf
            ? [s.lauf.quelle, s.lauf.dateiname, s.lauf.zeitpunkt.slice(0, 10)].filter(Boolean).join(" · ")
            : "",
      },
      { schluessel: "umsatzart", label: t("konten.vergleich.umsatzart"), wert: (s) => s.umsatz?.umsatzart ?? "" },
      { schluessel: "glaeubiger", label: t("konten.vergleich.glaeubigerId"), wert: (s) => s.umsatz?.glaeubigerId ?? "" },
      { schluessel: "mandat", label: t("konten.vergleich.mandatsreferenz"), wert: (s) => s.umsatz?.mandatsreferenz ?? "" },
      { schluessel: "e2e", label: t("konten.vergleich.e2eReferenz"), wert: (s) => s.umsatz?.e2eReferenz ?? "", lang: true },
      { schluessel: "bankref", label: t("konten.vergleich.bankreferenz"), wert: (s) => s.umsatz?.bankreferenz ?? "" },
      { schluessel: "nativeId", label: t("konten.detail.nativeId"), wert: (s) => s.umsatz?.nativeId ?? "" },
      { schluessel: "rohHash", label: t("konten.detail.rohHash"), wert: (s) => s.umsatz?.rohHash ?? "", lang: true },
    ],
    [t],
  );

  // Felder, die auf BEIDEN Seiten leer sind, werden gar nicht gezeigt: eine Tabelle voller
  // Striche verdeckt die Zeilen, auf die es ankommt. Was nur auf EINER Seite fehlt, bleibt
  // stehen — das ist selbst ein Unterschied.
  const sichtbar = felder.filter((f) => f.wert(links) !== "" || f.wert(rechts) !== "");

  async function wegDamit(seite: Vergleichsseite) {
    setFehler(null);
    setBusy(true);
    try {
      if (istBankzeile(seite)) await bankzeileVerwerfen(seite.buchung.id);
      else await buchungLoeschen(seite.buchung.id);
      await onGeaendert();
      onClose();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
      setBusy(false);
    }
  }

  async function keinDuplikat() {
    if (!links.umsatz || !rechts.umsatz) return;
    setFehler(null);
    setBusy(true);
    try {
      await dublettenFreigeben(links.umsatz.id, rechts.umsatz.id);
      await onGeaendert();
      onClose();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
      setBusy(false);
    }
  }

  const beideMitUmsatz = !!links.umsatz && !!rechts.umsatz;

  return (
    <Modal
      title={t("konten.vergleich.titel")}
      subtitle={t("konten.vergleich.untertitel")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("konten.abbrechen")}</Button>
          {beideMitUmsatz && (
            <button className="linkbtn" disabled={busy} onClick={() => keinDuplikat()}>
              {t("konten.dublette.keinDuplikat")}
            </button>
          )}
          {fehler && <span className="err">{fehler}</span>}
        </>
      }
    >
      {/* Der Grund zuerst: was der Finder gesehen hat, ist die Frage, die hier beantwortet
          wird — ohne ihn steht man vor zwei Spalten ohne Anlass. */}
      {verdacht && (
        <div
          className="muted"
          style={{ fontSize: "var(--fs-xs)", marginBottom: "var(--sp-4)", display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}
        >
          <Pill variant="warn">
            {t(verdacht.urteil === "identisch" ? "konten.dubletten.sicher" : "konten.dubletten.verdacht")}
          </Pill>
          <span>{verdacht.gruende.join(" · ")}</span>
        </div>
      )}

      {/* Die Beträge gross und nebeneinander: bei einer Dublette ist der Betrag das
          Erste, worauf man schaut, und der Saldo trägt die Folge. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(9rem, 1fr) 1fr 1fr", gap: "var(--sp-2) var(--sp-3)", alignItems: "baseline", marginBottom: "var(--sp-3)" }}>
        <span />
        {[links, rechts].map((s, i) => (
          <span key={i} className="num" style={{ fontWeight: 700, fontSize: "var(--fs-lg)", color: geldFarbe(s.buchung.betrag) }}>
            {geld.formatMitSymbol(s.buchung.betrag, { mitVorzeichen: true })}
          </span>
        ))}
      </div>

      <div
        role="table"
        style={{ display: "grid", gridTemplateColumns: "minmax(9rem, 1fr) 1fr 1fr", gap: "1px", background: "var(--line-soft)", border: "1px solid var(--line-soft)" }}
      >
        {sichtbar.map((f) => {
          const a = f.wert(links);
          const b = f.wert(rechts);
          const abweichend = a !== b;
          return (
            <Zeile key={f.schluessel} label={f.label} a={a} b={b} abweichend={abweichend} lang={f.lang} />
          );
        })}
      </div>

      {/* Je Spalte ein eigener Weg-Knopf, unter der Spalte: im Fuss wäre nicht zu sehen,
          welche der beiden Zeilen gemeint ist — und genau das ist hier die Entscheidung. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(9rem, 1fr) 1fr 1fr", gap: "var(--sp-3)", marginTop: "var(--sp-4)" }}>
        <span />
        {[links, rechts].map((s, i) => (
          <button
            key={i}
            className="linkbtn"
            disabled={busy}
            style={{ color: "var(--warn-deep)", textAlign: "left" }}
            onClick={() => wegDamit(s)}
          >
            {t(istBankzeile(s) ? "konten.vergleich.dieseVerwerfen" : "konten.vergleich.dieseLoeschen")}
          </button>
        ))}
      </div>

      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
        {t("konten.vergleich.folge")}
      </div>
    </Modal>
  );
}

/**
 * Eine Bankzeile wird verworfen, eine Dateizeile gelöscht — der Unterschied entscheidet,
 * ob die Zeile beim nächsten Abruf zurückkommt (siehe `bankzeileVerwerfen`).
 */
function istBankzeile(s: Vergleichsseite): boolean {
  return !!s.lauf && ABRUF_QUELLEN.has(s.lauf.quelle);
}

function Zeile({
  label, a, b, abweichend, lang,
}: {
  label: string; a: string; b: string; abweichend: boolean; lang?: boolean;
}) {
  const zelle = {
    background: "var(--surface)",
    padding: "var(--sp-2) var(--sp-3)",
    fontSize: "var(--fs-sm)",
    ...(lang ? { wordBreak: "break-word" as const } : { whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }),
  };
  const wert = (v: string) => ({
    ...zelle,
    ...(abweichend ? { background: "var(--warn-wash, var(--surface))", fontWeight: 600 } : {}),
    ...(v ? {} : { color: "var(--ink-3, var(--ink-2))" }),
  });
  return (
    <>
      <span style={{ ...zelle, color: "var(--ink-2)" }}>{label}</span>
      <span style={wert(a)} title={a || undefined}>{a || "—"}</span>
      <span style={wert(b)} title={b || undefined}>{b || "—"}</span>
    </>
  );
}
