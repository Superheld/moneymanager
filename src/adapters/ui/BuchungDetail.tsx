// Buchungsdetails (S-1c) — die Ansicht einer einzelnen Ist-Buchung, samt der Wege, die
// von dort ausgehen: aufteilen (S-7), zur Umbuchung machen (S-1), Vertrag daraus machen,
// Paarung lösen, löschen.
//
// Eigene Datei, weil sie an mehreren Stellen gebraucht wird: im Konto-Auszug UND in der
// Übersicht, wo man beim Durchsehen einer Kategorie auf eine Buchung stößt, die korrigiert
// gehört. Sie lädt ihre Bezugsdaten (Konten, Kategorien, Umsätze, Import-Läufe, Regeln)
// deshalb SELBST, statt sie sich von jedem Aufrufer durchreichen zu lassen — ein Dialog
// wird selten geöffnet, und die Alternative wäre, jeden Screen mit Daten zu belasten, die
// nur dieser Dialog braucht.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  istGeteilt,
  minorZuMajor,
  type Charakter,
  type IstBuchung,
  vertragZuGegenpartei,
  type Kategorie,
  type Vertrag,
  type Zahlungskonto,
  type Zahlungsregel,
} from "../../core";
import { buchungBearbeiten, buchungLoeschen } from "../../application/buchungErfassen";
import { zuruecksetzen, type ImportLauf, type Umsatz } from "../../application/import";
import { umbuchungLoeschen } from "../../application/umbuchungErfassen";
import { buchungSplitten, offenerRest, splitAufheben } from "../../application/buchungSplitten";
import {
  buchungenPaaren,
  gegenbeinErzeugen,
  paarungLoesen,
  paarungsKandidaten,
  umbuchungsBeinBearbeiten,
  MAX_VORSCHLAG_TAGE,
} from "../../application/umbuchungAusBuchung";
import { sqliteZahlungskontoRepository as kontoRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteKategorieRepository as kategorieRepo } from "../persistence/sqliteStammdatenRepositories";
import { sqliteZahlungsregelRepository as regelRepo } from "../persistence/sqliteZahlungsregelRepository";
import { sqliteVertragRepository as vertragRepo } from "../persistence/sqliteVertragRepository";
import { sqliteLedgerRepository as ledgerRepo } from "../persistence/sqliteLedgerRepository";
import {
  sqliteUmsatzRepository as umsatzRepo,
  sqliteImportLaufRepository as importLaufRepo,
} from "../persistence/sqliteImportRepositories";
import { Button, FormField, Pill } from "./ds";
import { formularAusBuchung, VertragModal } from "./VertragModal";
import { CategoryPicker } from "./CategoryPicker";
import { Modal } from "./Modal";
import { useGeld, useCharakterLabel, fehlerNachricht } from "./einstellungenKontext";

const CHARAKTERE: Charakter[] = ["Aufwand", "Ertrag", "Umschichtung"];

function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}
function betragFarbe(z: { betrag: number; charakter: Charakter }): string {
  if (z.betrag >= 0) return "var(--ok-deep)";
  return z.charakter === "Umschichtung" ? "var(--accent-deep)" : "var(--ink)";
}

/** Ein Label/Wert-Paar im Herkunfts-Abschnitt. Lange Werte (Hash, Zweck) dürfen umbrechen. */
function Infozeile({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "var(--sp-3)", padding: "5px 0", alignItems: "baseline" }}>
      <span style={{ flex: "0 0 34%", fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontWeight: "var(--fw-semi)" }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, wordBreak: "break-word", fontFamily: mono ? "var(--font-mono, monospace)" : undefined, color: mono ? "var(--ink-2)" : "var(--ink)" }}>
        {children}
      </span>
    </div>
  );
}

/**
 * Detailansicht einer gebuchten Ist-Buchung (S-1c). Vier Teile:
 *
 *  1. Was man ändern darf — das Formular.
 *  2. Kategorie ODER Aufteilung (S-7) — eine Entscheidung, ein Block.
 *  3. Umbuchung — Einstieg (S-1) bzw. Gegenbuchung und Paarung lösen.
 *  4. Herkunft — was über die Buchung bekannt ist, aber nirgends änderbar.
 *
 * Zu 3: Empfänger und Verwendungszweck hängen NICHT an der `IstBuchung`, sondern am
 * `Umsatz` (Import-Kontext, siehe ADR-0002) — hereingereicht statt hier nachgeladen,
 * der Screen hat die Zuordnung ohnehin schon.
 *
 * Zwei Gesichter beim Bearbeiten:
 *  • frei — alle Felder editierbar, plus der Einstieg „Zur Umbuchung machen" (S-1).
 *  • Bein einer Umbuchung — Betrag, Charakter und Kategorie sind FEST. `buchungBearbeiten`
 *    leitet das Vorzeichen über `vorzeichenbehaftet()` aus dem Charakter ab, und das macht
 *    eine Umschichtung immer negativ: das Zugangs-Bein (+500) würde beim Speichern auf
 *    −500 kippen und die Netto-Null der Umbuchung brechen. Datum und Notiz sind
 *    unkritisch (die beiden Beine dürfen ohnehin an verschiedenen Tagen liegen).
 */
function EditBuchungModal({ buchung, kategorien, kontoName, kategorieName, umsatz, importLauf, regel, gegenbuchung, onClose, onSaved, onDelete, onZurUmbuchung, onZuVertrag, vertrag, onLoesen, onGegenbuchung, onSplitten, onSplitAufheben }: { buchung: IstBuchung; kategorien: Kategorie[]; kontoName: Map<string, string>; umsatz?: Umsatz; importLauf?: ImportLauf; regel?: Zahlungsregel; gegenbuchung?: IstBuchung; kategorieName: Map<string, string>; onClose: () => void; onSaved: () => void; onDelete: () => void | Promise<void>; onZurUmbuchung: () => void; onZuVertrag: () => void; vertrag?: Vertrag; onLoesen: () => void | Promise<void>; onGegenbuchung: (b: IstBuchung) => void; onSplitten: () => void; onSplitAufheben: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const charakterLabel = useCharakterLabel();
  const [datum, setDatum] = useState(buchung.datum);
  const [betrag, setBetrag] = useState(String(minorZuMajor(Math.abs(buchung.betrag), geld.waehrung)));
  const [charakter, setCharakter] = useState<Charakter>(buchung.charakter);
  const [kategorieId, setKategorieId] = useState(buchung.kategorieId ?? "");
  const [notiz, setNotiz] = useState(buchung.notiz ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const gepaart = !!buchung.transferId;
  const geteilt = istGeteilt(buchung);

  async function speichern() {
    setFehler(null);
    try {
      if (gepaart) {
        await umbuchungsBeinBearbeiten(ledgerRepo, buchung, { datum, notiz });
      } else {
        await buchungBearbeiten(ledgerRepo, buchung, { datum, betrag: geld.parse(betrag) ?? 0, charakter, kategorieId: kategorieId || undefined, notiz });
      }
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("konten.detail.titel")}
      subtitle={buchung.quelle === "import" ? t("konten.editUntertitelImport") : undefined}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={speichern}>{t("konten.speichern")}</Button>
          <button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>
          <button className="linkbtn" style={{ marginLeft: "auto", color: "var(--danger, #c0392b)" }} onClick={() => onDelete()}>{t("konten.loeschen")}</button>
          {fehler && <span className="err">{fehler}</span>}
        </>
      }
    >
      {/* Kopf: worum es geht — Empfänger und Betrag, die beiden Dinge, an denen man
          eine Buchung wiedererkennt. Der Empfänger kommt aus dem Umsatz. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-4)" }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-h)" }}>
            {umsatz?.gegenpartei || buchung.notiz || kontoName.get(buchung.kontoId) || ""}
          </span>
          <span className="muted" style={{ display: "block", fontSize: "var(--fs-xs)", marginTop: 4 }}>
            {ddmm(buchung.datum)} · {kontoName.get(buchung.kontoId) ?? "?"}
          </span>
        </span>
        <span className="num" style={{ fontSize: "var(--fs-h2, var(--fs-h3))", fontWeight: "var(--fw-black)", color: betragFarbe(buchung) }}>
          {geld.formatMitSymbol(buchung.betrag, { mitVorzeichen: true })}
        </span>
      </div>

      <div className="form-grid">
        <FormField label={t("konten.feldDatum")} required>
          <input className="field" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </FormField>
        <FormField label={t("konten.feldBetrag")} required>
          <input className="field" inputMode="decimal" value={betrag} disabled={gepaart} onChange={(e) => setBetrag(e.target.value)} placeholder={geld.format(0)} />
        </FormField>
        {!gepaart && (
          <FormField label={t("konten.feldCharakter")}>
            <select className="field" value={charakter} onChange={(e) => setCharakter(e.target.value as Charakter)}>
              {CHARAKTERE.map((c) => (<option key={c} value={c}>{charakterLabel(c)}</option>))}
            </select>
          </FormField>
        )}
        <FormField label={t("konten.feldNotiz")} hint={t("konten.optional")}>
          <input className="field" value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder={t("konten.buchung.notizPlatzhalter")} />
        </FormField>
      </div>

      {/* Kategorie ODER Aufteilung — nie beides. `buchungSplitten` löscht die Kategorie,
          wenn Teile entstehen; die Aufteilung ist ab dann die Wahrheit. Solange beides
          getrennt im Dialog stand (Kategorie oben, Aufteilung unter der Umbuchung), sah es
          aus wie zwei unabhängige Angaben — und man konnte einer geteilten Buchung wieder
          eine Kategorie geben, also genau den Zustand herstellen, den das Modell ausschließt.
          Jetzt EIN Block, der zeigt, welcher der beiden Fälle gerade gilt. */}
      {!gepaart && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          {geteilt ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)" }}>
                  {t("konten.split.abschnitt")}
                </span>
                <button className="linkbtn" style={{ marginLeft: "auto" }} onClick={onSplitten}>{t("konten.split.bearbeiten")}</button>
                <button className="linkbtn" onClick={() => onSplitAufheben()}>{t("konten.split.aufheben")}</button>
              </div>
              {(buchung.aufteilungen ?? []).map((a, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)", padding: "5px 0", borderBottom: "1px solid var(--line-soft)" }}>
                  <span style={{ fontSize: 13, minWidth: 0 }}>
                    {kategorieName.get(a.kategorieId) ?? "?"}
                    {a.notiz && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{a.notiz}</span>}
                  </span>
                  <span className="num" style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {geld.formatMitSymbol(a.betrag, { mitVorzeichen: true })}
                  </span>
                </div>
              ))}
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>{t("konten.split.stattKategorie")} {t("konten.split.aufhebenHinweis")}</div>
            </>
          ) : (
            <>
              <FormField label={t("konten.feldKategorie")} hint={t("konten.optional")}>
                <CategoryPicker kategorien={kategorien} value={kategorieId} onChange={setKategorieId} />
              </FormField>
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
                <button className="linkbtn" onClick={onSplitten}>{t("konten.split.aktion")}</button>
                {" · "}
                {t("konten.split.untertitel")}
              </div>
            </>
          )}
        </div>
      )}

      {/* Umbuchungs-Abschnitt: Einstieg (S-1) bzw. Gegenbuchung und Paarung lösen */}
      <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
        {gepaart ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <Pill variant="um">{t("konten.paarung.titel")}</Pill>
              <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
                {t("konten.paarung.gegenkonto")}: {kontoName.get(buchung.gegenkontoId ?? "") ?? "?"}
              </span>
              <button className="linkbtn" style={{ marginLeft: "auto" }} onClick={() => onLoesen()}>{t("konten.paarung.loesen")}</button>
            </div>

            {/* Sprung ins andere Bein — derselbe Dialog, andere Buchung. */}
            {gegenbuchung && (
              <button
                className="linkbtn"
                title={t("konten.paarung.gegenbuchungOeffnen")}
                onClick={() => onGegenbuchung(gegenbuchung)}
                style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, marginTop: 8, padding: "8px 10px", borderRadius: "var(--r-md)", background: "var(--surface-2, var(--accent-wash))", textAlign: "left" }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", minWidth: 42 }}>{ddmm(gegenbuchung.datum)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
                  {t("konten.paarung.gegenbuchung")} · {kontoName.get(gegenbuchung.kontoId) ?? "?"}
                </span>
                <span className="num" style={{ fontWeight: 700, color: betragFarbe(gegenbuchung) }}>
                  {geld.formatMitSymbol(gegenbuchung.betrag, { mitVorzeichen: true })}
                </span>
                <span aria-hidden style={{ color: "var(--ink-3)" }}>›</span>
              </button>
            )}

            <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
              {t("konten.paarung.loesenHinweis")} {t("konten.paarung.loeschtBeide")}
            </div>
          </>
        ) : (
          <>
            <Button onClick={onZurUmbuchung}>{t("konten.zurUmbuchung.aktion")}</Button>
            <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
              {t("konten.zurUmbuchung.untertitel")}
            </div>
          </>
        )}
      </div>

      {/* Vertrag — an derselben Stelle zwei Zustände, weil es dieselbe Frage ist:
          gehört diese Zahlung schon zu einem Vertrag, oder soll sie einer werden?
          Wer hier nur „Vertrag daraus machen" liest, legt beim zweiten Blick auf
          dieselbe Miete einen zweiten Mietvertrag an.

          Nicht bei Umbuchungs-Beinen: eine Umbuchung aufs eigene Sparkonto ist perfekt
          regelmäßig und trotzdem kein Vertrag (dieselbe Grenze zieht die Erkennung). */}
      {!gepaart && (
        <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
          {vertrag ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                <Pill variant="ok">{t("konten.zuVertrag.gehoertZu")}</Pill>
                <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>{vertrag.anbieter}</span>
              </div>
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
                {t("konten.zuVertrag.gehoertZuHinweis")}
              </div>
            </>
          ) : (
            <>
              <Button onClick={onZuVertrag}>{t("konten.zuVertrag.aktion")}</Button>
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
                {t("konten.zuVertrag.untertitel")}
              </div>
            </>
          )}
        </div>
      )}

      {/* Herkunft — alles, was bekannt ist, aber hier nicht geändert wird. */}
      <div style={{ marginTop: "var(--sp-4)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line)" }}>
        <div style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)", marginBottom: 8 }}>
          {t("konten.detail.herkunft")}
        </div>

        <Infozeile label={t("konten.detail.erfasstUeber")}>{t(`konten.quelleName.${buchung.quelle}`)}</Infozeile>
        <Infozeile label={t("konten.detail.konto")}>{kontoName.get(buchung.kontoId) ?? "?"}</Infozeile>

        {umsatz ? (
          <>
            <Infozeile label={t("konten.detail.empfaenger")}>{umsatz.gegenpartei || "—"}</Infozeile>
            <Infozeile label={t("konten.detail.zweck")}>{umsatz.verwendungszweck || "—"}</Infozeile>
            {importLauf && (
              <Infozeile label={t("konten.detail.importlauf")}>
                {t("konten.detail.importlaufWert", {
                  quelle: importLauf.dateiname || importLauf.quelle,
                  zeitpunkt: importLauf.zeitpunkt.slice(0, 10),
                })}
              </Infozeile>
            )}
            {umsatz.nativeId && <Infozeile label={t("konten.detail.nativeId")} mono>{umsatz.nativeId}</Infozeile>}
            <Infozeile label={t("konten.detail.rohHash")} mono>{umsatz.rohHash}</Infozeile>
          </>
        ) : (
          <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>{t("konten.detail.ohneImport")}</div>
        )}

        {buchung.planRef && (
          <Infozeile label={t("konten.detail.planbezug")}>
            {t("konten.detail.planbezugWert", {
              regel: regel?.bezeichnung ?? buchung.planRef.quelleId,
              faelligkeit: ddmm(buchung.planRef.faelligkeit),
            })}
          </Infozeile>
        )}
      </div>
    </Modal>
  );
}

/**
 * S-7 — Buchung auf mehrere Kategorien aufteilen. Der Betrag der Buchung bleibt, was er
 * ist; verteilt wird nur die Kategorie-Zuordnung. Der Dialog lässt sich nicht speichern,
 * solange der Rest nicht null ist — die Invariante steht im Use-Case, hier wird sie nur
 * früh genug sichtbar gemacht.
 *
 * Beträge werden POSITIV eingegeben; das Vorzeichen kommt von der Buchung.
 */
function SplitModal({ buchung, kategorien, onClose, onSaved }: { buchung: IstBuchung; kategorien: Kategorie[]; onClose: () => void; onSaved: () => void }) {
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
      await buchungSplitten(ledgerRepo, buchung, eingaben);
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
        <span className="num" style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-black)", color: betragFarbe(buchung) }}>
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

/**
 * S-1 — macht aus einer bestehenden Buchung eine Umbuchung. EIN Dialog für beide Fälle:
 * oben die passenden Gegenbuchungen (S-1b, nachträgliche Paarung), darunter der Ausweg
 * „Gegenbein neu erzeugen" (S-1a, Zielkonto wird nicht importiert). Der Nutzer soll nicht
 * vorher wissen müssen, welcher Fall vorliegt — die Liste beantwortet das.
 */
function ZurUmbuchungModal({ buchung, konten, alleBuchungen, kontoName, umsatzByIst, onClose, onSaved }: { buchung: IstBuchung; konten: Zahlungskonto[]; alleBuchungen: IstBuchung[]; kontoName: Map<string, string>; umsatzByIst: Map<string, Umsatz>; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const kandidaten = useMemo(() => paarungsKandidaten(alleBuchungen, buchung), [alleBuchungen, buchung]);
  const andereKonten = konten.filter((k) => k.id !== buchung.kontoId);
  // Vorauswahl: der beste Kandidat, sonst der Weg über ein neu erzeugtes Gegenbein.
  const [wahl, setWahl] = useState<string>(kandidaten[0]?.id ?? "__neu");
  const [neuKontoId, setNeuKontoId] = useState(andereKonten[0]?.id ?? "");
  const [fehler, setFehler] = useState<string | null>(null);

  /** Beschriftung einer Gegenbuchung: Empfänger aus dem Import, sonst Notiz. */
  function kandidatLabel(k: IstBuchung): string {
    return umsatzByIst.get(k.id)?.gegenpartei || k.notiz || "";
  }

  async function speichern() {
    setFehler(null);
    try {
      if (wahl === "__neu") {
        await gegenbeinErzeugen(ledgerRepo, buchung, neuKontoId);
      } else {
        const gegen = alleBuchungen.find((b) => b.id === wahl);
        if (!gegen) return;
        await buchungenPaaren(ledgerRepo, buchung, gegen);
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
      footer={<><Button variant="primary" onClick={speichern}>{t("konten.zurUmbuchung.bestaetigen")}</Button><button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}
    >
      {/* Die Buchung, um die es geht */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap", padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--surface-2, var(--accent-wash))", marginBottom: "var(--sp-4)" }}>
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>
          {ddmm(buchung.datum)} · {kandidatLabel(buchung) || kontoName.get(buchung.kontoId) || ""}
        </span>
        <span className="num" style={{ fontWeight: 700, color: betragFarbe(buchung) }}>
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
            <span className="num" style={{ fontWeight: 700, color: betragFarbe(k) }}>{geld.formatMitSymbol(k.betrag, { mitVorzeichen: true })}</span>
          </label>
        ))
      )}

      {/* Ausweg: kein Gegenbein vorhanden (S-1a) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "var(--sp-4) 0 var(--sp-3)", color: "var(--ink-3)", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)" }}>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        {t("konten.zurUmbuchung.oder")}
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <input type="radio" name="gegenbein" value="__neu" checked={wahl === "__neu"} onChange={() => setWahl("__neu")} style={{ accentColor: "var(--accent-deep)" }} />
        <span style={{ fontSize: 13.5, fontWeight: "var(--fw-semi)" }}>{t("konten.zurUmbuchung.neu")}</span>
        <select className="field" style={{ width: "auto" }} value={neuKontoId} onChange={(e) => { setNeuKontoId(e.target.value); setWahl("__neu"); }}>
          {andereKonten.map((k) => (<option key={k.id} value={k.id}>{k.bezeichnung}</option>))}
        </select>
      </label>
      <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>{t("konten.zurUmbuchung.neuHinweis")}</div>

      {buchung.kategorieId && (
        <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--line-soft)" }}>
          {t("konten.zurUmbuchung.kategorieHinweis")}
        </div>
      )}
    </Modal>
  );
}

/**
 * Einstiegspunkt: zeigt die Details zu `buchung` und führt die Folge-Dialoge.
 *
 * `onGeaendert` wird gerufen, wenn sich in der Datenbank etwas geändert hat — der
 * aufrufende Screen lädt dann seine eigenen Daten neu. `onClose` schließt ohne Änderung.
 */
export function BuchungDetail({ buchung, onClose, onGeaendert }: {
  buchung: IstBuchung;
  onClose: () => void;
  onGeaendert: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const geld = useGeld();
  // Welche Buchung gerade gezeigt wird — der Sprung zur Gegenbuchung ändert das, ohne
  // dass der aufrufende Screen etwas davon wissen muss.
  const [aktuelle, setAktuelle] = useState(buchung);
  const [splitten, setSplitten] = useState<IstBuchung | null>(null);
  const [umbuchenAus, setUmbuchenAus] = useState<IstBuchung | null>(null);
  const [vertragAus, setVertragAus] = useState<IstBuchung | null>(null);

  const [konten, setKonten] = useState<Zahlungskonto[]>([]);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [regeln, setRegeln] = useState<Zahlungsregel[]>([]);
  const [umsaetze, setUmsaetze] = useState<Umsatz[]>([]);
  const [laeufe, setLaeufe] = useState<ImportLauf[]>([]);
  const [alle, setAlle] = useState<IstBuchung[]>([]);
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);

  async function laden() {
    const [ks, kats, rs, us, ls, bs, vs] = await Promise.all([
      kontoRepo.alle(), kategorieRepo.alle(), regelRepo.alle(),
      umsatzRepo.alle(), importLaufRepo.alle(), ledgerRepo.alle(), vertragRepo.alle(),
    ]);
    setKonten(ks); setKategorien(kats); setRegeln(rs);
    setUmsaetze(us); setLaeufe(ls); setAlle(bs); setVertraege(vs);
    // Die gezeigte Buchung aus dem frischen Stand nachziehen (nach dem Speichern).
    setAktuelle((b) => bs.find((x) => x.id === b.id) ?? b);
  }
  useEffect(() => { laden(); }, []);

  const kontoName = useMemo(() => new Map(konten.map((k) => [k.id, k.bezeichnung])), [konten]);
  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);
  const umsatzByIst = useMemo(() => {
    const m = new Map<string, Umsatz>();
    for (const u of umsaetze) if (u.istbuchungId) m.set(u.istbuchungId, u);
    return m;
  }, [umsaetze]);

  const umsatz = umsatzByIst.get(aktuelle.id);
  /**
   * Gehört die Zahlung zu einem erfassten Vertrag? Abgeleitet aus dem Empfängernamen,
   * nicht aus einer Verknüpfung — es gibt keine (siehe `vertragZuGegenpartei`). Ohne
   * Empfänger (Handbuchung) hilft die Notiz: sie ist an dieser Stelle das, woran man
   * die Zahlung wiedererkennt, und genau der Text, aus dem der Anbieter vorbelegt wird.
   */
  const vertrag = useMemo(
    () => vertragZuGegenpartei(vertraege, umsatz?.gegenpartei || aktuelle.notiz || ""),
    [vertraege, umsatz, aktuelle.notiz],
  );
  const gegenbuchung = aktuelle.transferId
    ? alle.find((x) => x.transferId === aktuelle.transferId && x.id !== aktuelle.id)
    : undefined;

  /** Importierte Buchungen tragen einen Umsatz — der muss zurück in die Inbox. */
  async function umsaetzeZuruecksetzen(istIds: string[]) {
    for (const id of istIds) {
      const u = umsaetze.find((x) => x.istbuchungId === id);
      if (u) await umsatzRepo.speichern(zuruecksetzen(u));
    }
  }

  /** Löscht die Buchung — bei einer Umbuchung BEIDE Beine, sonst bliebe eines verwaist. */
  async function entfernen() {
    if (aktuelle.transferId) {
      const beine = alle.filter((x) => x.transferId === aktuelle.transferId);
      await umbuchungLoeschen(ledgerRepo, aktuelle.transferId);
      await umsaetzeZuruecksetzen(beine.map((x) => x.id));
    } else {
      await buchungLoeschen(ledgerRepo, aktuelle.id);
      await umsaetzeZuruecksetzen([aktuelle.id]);
    }
    await onGeaendert();
    onClose();
  }

  async function nachAenderung() {
    await laden();
    await onGeaendert();
  }

  if (splitten) {
    return (
      <SplitModal
        buchung={splitten}
        kategorien={kategorien}
        onClose={() => setSplitten(null)}
        onSaved={async () => { setSplitten(null); await nachAenderung(); }}
      />
    );
  }

  if (vertragAus) {
    // Der Anbieter ist das, woran man die Zahlung wiedererkennt: der Empfänger aus dem
    // Import, sonst die Notiz. Leer lassen wäre schlechter als ein Vorschlag, den man
    // überschreibt — Pflichtfeld ist er ohnehin.
    const anbieter = umsatzByIst.get(vertragAus.id)?.gegenpartei || vertragAus.notiz || "";
    return (
      <VertragModal
        start={formularAusBuchung(vertragAus, anbieter, geld)}
        hinweis={t("konten.zuVertrag.hinweis")}
        onClose={() => setVertragAus(null)}
        onSaved={async () => { setVertragAus(null); await nachAenderung(); }}
      />
    );
  }

  if (umbuchenAus) {
    return (
      <ZurUmbuchungModal
        buchung={umbuchenAus}
        konten={konten}
        alleBuchungen={alle}
        kontoName={kontoName}
        umsatzByIst={umsatzByIst}
        onClose={() => setUmbuchenAus(null)}
        onSaved={async () => { setUmbuchenAus(null); await nachAenderung(); }}
      />
    );
  }

  return (
    <EditBuchungModal
      // Ohne key bliebe beim Sprung zur Gegenbuchung der Formular-State der ALTEN
      // Buchung stehen — useState-Initialwerte laufen nur beim Mount.
      key={aktuelle.id}
      buchung={aktuelle}
      kategorien={kategorien}
      kontoName={kontoName}
      kategorieName={kategorieName}
      umsatz={umsatz}
      importLauf={umsatz ? laeufe.find((l) => l.id === umsatz.laufId) : undefined}
      regel={aktuelle.planRef ? regeln.find((r) => r.id === aktuelle.planRef!.quelleId) : undefined}
      gegenbuchung={gegenbuchung}
      onClose={onClose}
      onSaved={async () => { await nachAenderung(); onClose(); }}
      onDelete={entfernen}
      onZurUmbuchung={() => setUmbuchenAus(aktuelle)}
      onZuVertrag={() => setVertragAus(aktuelle)}
      vertrag={vertrag}
      onLoesen={async () => { await paarungLoesen(ledgerRepo, aktuelle.transferId!); await nachAenderung(); onClose(); }}
      onGegenbuchung={setAktuelle}
      onSplitten={() => setSplitten(aktuelle)}
      onSplitAufheben={async () => { await splitAufheben(ledgerRepo, aktuelle); await nachAenderung(); onClose(); }}
    />
  );
}
