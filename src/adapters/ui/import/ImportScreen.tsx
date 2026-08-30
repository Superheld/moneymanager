// Import-Screen (Slice 3) — Datei → Konten zuordnen → „Übernehmen" schreibt den
// reversiblen Entwurfs-Stapel. Berührt KEINE Salden. Das zeilenweise Bearbeiten der
// Kategorien + Verbuchen kommt als Review-Inbox (Slice 4). Alles Geld über useGeld(),
// alle Strings über t(). Persistenz nur in der Desktop-App (tauri dev).

import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KONTOTYPEN, type Kategorie, type Kontotyp, type Zahlungskonto } from "../../../application";
import { importUebernehmen, stammdaten } from "../../dienste";
import {
  fremdkategorienInDatei,
  kontoMatchVorschlag,
  quelleKeyFuer,
  vorbelegteZuordnung,
  waehleAdapter,
  type ImportErgebnis,
  type KontoMatch,
  type UebernahmeErgebnis,
  type UebernahmeKonto,
} from "../../../application/import";
// Selbst-Registrierung des Finanzguru-Adapters auslösen.
import "../../import/finanzguruAdapter";
import { Button, Card, DataTable } from "../bausteine";
import { Auswahl } from "../bausteine/Auswahl";
import { FremdkategorienKarte } from "./FremdkategorienKarte";
import { useGeld } from "../bausteine/einstellungenKontext";

const VORSCHAU_MAX = 500;
type RU = ImportErgebnis["umsaetze"][number];

interface Ziel {
  modus: "neu" | "existing";
  kontoId?: string;
  bezeichnung: string;
  typ: Kontotyp;
  iban?: string;
}

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function ImportScreen() {
  const { t } = useTranslation();
  const geld = useGeld();
  const inputRef = useRef<HTMLInputElement>(null);

  const [ergebnis, setErgebnis] = useState<ImportErgebnis | null>(null);
  const [dateiname, setDateiname] = useState<string | null>(null);
  const [nichtErkannt, setNichtErkannt] = useState(false);
  const [bestehende, setBestehende] = useState<Zahlungskonto[]>([]);
  const [matches, setMatches] = useState<KontoMatch[]>([]);
  const [ziele, setZiele] = useState<Record<string, Ziel>>({});
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [uErgebnis, setUErgebnis] = useState<UebernahmeErgebnis | null>(null);
  const [kategorien, setKategorien] = useState<Kategorie[]>([]);
  const [zuordnung, setZuordnung] = useState<Record<string, string>>({});
  /**
   * Quell-Konten, die NICHT mitkommen sollen.
   *
   * Als Ausschlussliste und nicht als Einschlussliste: die Vorgabe ist „alles", und was
   * abgewählt wurde, ist die Ausnahme. Andersherum müsste beim Einlesen erst eine Liste
   * gefüllt werden, und ein Fehler darin sähe aus wie eine leere Datei.
   */
  const [ausgeschlossen, setAusgeschlossen] = useState<Set<string>>(new Set());

  async function dateiGewaehlt(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!datei) return;
    setDateiname(datei.name);
    setUErgebnis(null);
    setFehler(null);
    // Rohe Bytes: der Quellen-Port entscheidet selbst, wie er sie liest (xlsx = ZIP).
    const inhalt = new Uint8Array(await datei.arrayBuffer());
    const adapter = waehleAdapter(inhalt);
    if (!adapter) {
      setErgebnis(null);
      setNichtErkannt(true);
      return;
    }
    setNichtErkannt(false);
    const erg = adapter.lies(inhalt);
    setErgebnis(erg);

    let konten: Zahlungskonto[] = [];
    let kats: Kategorie[] = [];
    try {
      const daten = await stammdaten();
      konten = [...daten.konten];
      kats = [...daten.kategorien];
    } catch {
      konten = []; // reiner Browser-Modus ohne SQLite
    }
    setBestehende(konten);
    setKategorien(kats);

    // Die Zuordnung der fremden Kategorien wird VORBELEGT, nicht gesetzt: was die
    // Übersetzung des Adapters vorschlägt, steht da und lässt sich ändern.
    //
    // Vorbelegt wird über die GANZE Datei, nicht über die später gewählten Konten: ein
    // Eintrag zu einem Namen, der gerade nicht vorkommt, schadet nichts (nachgeschlagen
    // wird beim Übernehmen), und so überlebt eine getroffene Wahl das Ab- und
    // Wiederanwählen eines Kontos.
    setZuordnung(vorbelegteZuordnung(fremdkategorienInDatei(erg.umsaetze, kats)));
    setAusgeschlossen(new Set());
    const ms = kontoMatchVorschlag(erg.umsaetze, konten);
    setMatches(ms);
    const z: Record<string, Ziel> = {};
    for (const m of ms) {
      z[m.quelleKey] = m.kontoId
        ? { modus: "existing", kontoId: m.kontoId, bezeichnung: m.quelleName ?? "", typ: "Giro" }
        : { modus: "neu", bezeichnung: m.neu!.bezeichnung, typ: m.neu!.typ, iban: m.neu!.iban };
    }
    setZiele(z);
  }

  function setZiel(key: string, patch: Partial<Ziel>) {
    setZiele((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function zielGewaehlt(m: KontoMatch, value: string) {
    if (value === "__neu") {
      setZiel(m.quelleKey, {
        modus: "neu",
        kontoId: undefined,
        bezeichnung: m.neu?.bezeichnung ?? m.quelleName ?? "",
        typ: m.neu?.typ ?? "Giro",
        iban: m.neu?.iban,
      });
    } else {
      setZiel(m.quelleKey, { modus: "existing", kontoId: value });
    }
  }

  async function uebernehmen() {
    if (!ergebnis) return;
    setBusy(true);
    setFehler(null);
    try {
      // Ein abgewähltes Konto kommt gar nicht erst in die Auflösung. Es hier zu lassen
      // und nur die Zeilen wegzufiltern hiesse, ein Konto anzulegen, in dem nichts steht.
      const konten: UebernahmeKonto[] = matches
        .filter((m) => !ausgeschlossen.has(m.quelleKey))
        .map((m) => {
          const z = ziele[m.quelleKey];
          return z.modus === "existing" && z.kontoId
            ? { quelleKey: m.quelleKey, kontoId: z.kontoId }
            : { quelleKey: m.quelleKey, neu: { bezeichnung: z.bezeichnung, typ: z.typ, iban: z.iban } };
        });
      const r = await importUebernehmen({
        quelle: ergebnis.quelle,
        dateiname: dateiname ?? undefined,
        zeitpunkt: new Date().toISOString(),
        rohUmsaetze: beruecksichtigt,
        konten,
        fremdkategorien: zuordnung,
      });
      setUErgebnis(r);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Die Zeilen der abgewählten Konten fallen ÜBERALL heraus — Vorschau, Zuordnung,
   * Übernahme.
   *
   * Das ist der Punkt, an dem eine Auswahl ehrlich wird: eine Abwahl, die nur beim
   * Schreiben greift, während die Vorschau weiter alles zählt, ist eine Zahl, die
   * niemandes Frage beantwortet.
   */
  const beruecksichtigt = useMemo(
    () =>
      (ergebnis?.umsaetze ?? []).filter(
        (u) => !ausgeschlossen.has(quelleKeyFuer(u.kontoIban)),
      ),
    [ergebnis, ausgeschlossen],
  );

  const fremdbefund = useMemo(
    () => (ergebnis ? fremdkategorienInDatei(beruecksichtigt, kategorien) : null),
    [ergebnis, beruecksichtigt, kategorien],
  );

  const katName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);
  const konten = new Set(beruecksichtigt.map((u) => u.kontoIban)).size;
  const vorschau = beruecksichtigt.slice(0, VORSCHAU_MAX);
  const eingabeStil = { padding: "5px 8px", borderRadius: "var(--r-md)", border: "1px solid var(--line)", background: "var(--surface)", fontSize: "13px", fontFamily: "var(--font-ui)" } as const;

  return (
    <>

      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap" }}>
          <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={dateiGewaehlt} style={{ display: "none" }} />
          <Button variant="primary" onClick={() => inputRef.current?.click()}>{t("import.dateiWaehlen")}</Button>
          {dateiname && <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{dateiname}</span>}
        </div>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: "var(--sp-3)" }}>{t("import.hinweis")}</div>
      </Card>

      {nichtErkannt && (
        <Card style={{ marginTop: "var(--sp-4)", borderColor: "var(--warn, #d9822b)" }}>{t("import.nichtErkannt")}</Card>
      )}

      {ergebnis && (
        <Card
          style={{ marginTop: "var(--sp-4)" }}
          title={t("import.kontenTitel")}
          subtitle={t("import.kontenHinweis")}
        >
          {ergebnis.warnungen.length > 0 && (
            <ul style={{ margin: "0 0 var(--sp-3)", paddingLeft: "1.2em", color: "var(--ink-2)", fontSize: "var(--fs-xs)" }}>
              {ergebnis.warnungen.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={{ width: 32, padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>
                  <input
                    type="checkbox"
                    checked={matches.some((m) => !ausgeschlossen.has(m.quelleKey))}
                    aria-label={t("import.alleKontenImportieren")}
                    onChange={(e) =>
                      setAusgeschlossen(
                        e.target.checked ? new Set() : new Set(matches.map((m) => m.quelleKey)),
                      )
                    }
                    style={{ accentColor: "var(--accent-deep)", cursor: "pointer" }}
                  />
                </th>
                <th style={{ textAlign: "left", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>{t("import.spalteQuelle")}</th>
                <th style={{ textAlign: "left", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: ".04em", color: "var(--ink-3)", padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>{t("import.spalteZiel")}</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => {
                const z = ziele[m.quelleKey];
                if (!z) return null;
                const dabei = !ausgeschlossen.has(m.quelleKey);
                return (
                  <tr key={m.quelleKey}>
                    <td style={{ padding: "10px", borderBottom: "1px solid var(--line-soft)", verticalAlign: "top" }}>
                      <input
                        type="checkbox"
                        checked={dabei}
                        aria-label={t("import.kontoImportieren", { name: m.quelleName ?? m.quelleKey })}
                        onChange={() =>
                          setAusgeschlossen((bisher) => {
                            const neu = new Set(bisher);
                            if (neu.has(m.quelleKey)) neu.delete(m.quelleKey);
                            else neu.add(m.quelleKey);
                            return neu;
                          })
                        }
                        style={{ accentColor: "var(--accent-deep)", cursor: "pointer" }}
                      />
                    </td>
                    {/* Die abgewählte Zeile bleibt STEHEN und wird nur blass. Sie zu
                        verstecken nähme den Weg zurück und liesse die Datei kleiner
                        aussehen, als sie ist. */}
                    <td style={{ padding: "10px", borderBottom: "1px solid var(--line-soft)", verticalAlign: "top", opacity: dabei ? 1 : 0.45 }}>
                      <div style={{ fontWeight: "var(--fw-bold)", color: "var(--ink)" }}>{m.quelleName ?? m.quelleKey}</div>
                      <div style={{ fontSize: "var(--fs-2xs)", color: "var(--ink-3)" }}>
                        {dabei
                          ? t("import.buchungenAnzahl", { n: m.anzahl })
                          : t("import.kontoUebersprungen", { n: m.anzahl })}
                      </div>
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid var(--line-soft)", opacity: dabei ? 1 : 0.45, pointerEvents: dabei ? "auto" : "none" }}>
                      <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ minWidth: 170 }}>
                          <Auswahl
                            ariaLabel={t("import.zielKonto")}
                            wert={z.modus === "existing" ? (z.kontoId ?? "__neu") : "__neu"}
                            aufAenderung={(v) => zielGewaehlt(m, v)}
                            optionen={[
                              { wert: "__neu", text: t("import.neuAnlegen") },
                              ...bestehende.map((k) => ({ wert: k.id, text: k.bezeichnung })),
                            ]}
                          />
                        </span>
                        {z.modus === "neu" && (
                          <>
                            <input
                              value={z.bezeichnung}
                              onChange={(e) => setZiel(m.quelleKey, { bezeichnung: e.target.value })}
                              placeholder={t("import.feldBezeichnung")}
                              style={{ ...eingabeStil, minWidth: 140 }}
                            />
                            <span style={{ minWidth: 150 }}>
                              <Auswahl
                                ariaLabel={t("import.feldTyp")}
                                wert={z.typ}
                                aufAenderung={(v) => setZiel(m.quelleKey, { typ: v as Kontotyp })}
                                optionen={KONTOTYPEN.map((kt) => ({ wert: kt, text: t(`konten.typ.${kt}`) }))}
                              />
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginTop: "var(--sp-4)", flexWrap: "wrap" }}>
            <Button
              variant="primary"
              onClick={busy || uErgebnis || beruecksichtigt.length === 0 ? undefined : uebernehmen}
              style={busy || uErgebnis || beruecksichtigt.length === 0 ? { opacity: 0.5, cursor: busy ? "wait" : "not-allowed" } : undefined}
            >
              {busy ? t("import.uebernehmenBusy") : t("import.uebernehmen")}
            </Button>
            {uErgebnis && (
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>
                {t("import.uebernahmeErgebnis", { neu: uErgebnis.neu, duplikate: uErgebnis.duplikate, konten: uErgebnis.angelegteKonten })}
              </span>
            )}
          </div>
          {uErgebnis && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: "var(--sp-2)" }}>{t("import.uebernahmeHinweis")}</div>}
          {fehler && <div style={{ fontSize: "var(--fs-xs)", color: "var(--danger, #c0392b)", marginTop: "var(--sp-2)" }}>{t("import.fehlerDb")} ({fehler})</div>}
        </Card>
      )}

      {ergebnis && fremdbefund && (
        <FremdkategorienKarte
          befund={fremdbefund}
          kategorien={kategorien}
          zuordnung={zuordnung}
          aufAenderung={(fremd, id) =>
            setZuordnung((prev) => {
              // Eine leere Wahl heisst „nicht zuordnen" — der Eintrag fällt raus, statt
              // mit leerem Wert stehenzubleiben und beim Auflösen ins Leere zu greifen.
              const naechste = { ...prev };
              if (id) naechste[fremd] = id;
              else delete naechste[fremd];
              return naechste;
            })
          }
        />
      )}

      {ergebnis && (
        <Card style={{ marginTop: "var(--sp-4)" }} title={t("import.vorschauTitel")} subtitle={t("import.erkannt", { n: beruecksichtigt.length, quelle: ergebnis.quelle, konten })}>
          <DataTable
            columns={[
              { key: "buchungstag", label: t("import.spalteDatum"), render: (u: RU) => ddmmyyyy(u.buchungstag) },
              { key: "betrag", label: `${t("import.spalteBetrag")} ${geld.symbol}`, align: "right", render: (u: RU) => geld.format(u.betrag, { mitVorzeichen: true }) },
              { key: "gegenpartei", label: t("import.spalteGegenpartei") },
              { key: "verwendungszweck", label: t("import.spalteZweck"), render: (u: RU) => (u.verwendungszweck.length > 60 ? u.verwendungszweck.slice(0, 60) + "…" : u.verwendungszweck) },
              {
                key: "kategorieHinweis",
                label: t("import.spalteKategorie"),
                // **Was die Datei sagte UND was daraus wird.** Nur den Hinweis zu zeigen
                // beantwortete die halbe Frage: er ist fremdes Vokabular, und ob er hier
                // ankommt, stand nirgends. Jetzt zieht die Zuordnung der Karte darüber
                // bis in die Zeile durch — wer dort etwas umstellt, sieht es hier.
                render: (u: RU) => {
                  if (u.istUmbuchung) return "↔ Umbuchung";
                  const fremd = u.kategorieHinweis?.trim();
                  if (!fremd) return "—";
                  const ziel = zuordnung[fremd];
                  const name = ziel ? katName.get(ziel) : undefined;
                  return (
                    <span>
                      <span style={{ color: "var(--ink-3)" }}>{fremd}</span>
                      {name ? <> → {name}</> : <span style={{ color: "var(--ink-3)" }}> → —</span>}
                    </span>
                  );
                },
              },
            ]}
            rows={vorschau}
          />
          {beruecksichtigt.length > VORSCHAU_MAX && (
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: "var(--sp-3)" }}>
              {t("import.zeigeAuszug", { zeige: VORSCHAU_MAX, gesamt: beruecksichtigt.length })}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
