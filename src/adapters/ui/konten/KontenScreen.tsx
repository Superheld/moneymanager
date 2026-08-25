// Konten (P3) — die kontozentrische Sicht. Oben alle Konten mit realem Stand; darunter
// das Register eines gewählten Kontos: Anfangsbestand → gebuchte Ist-Buchungen (laufender
// Saldo) → „heute" → geplante Buchungen der kommenden X Tage (abhakbar). Plus manuelle
// Buchung erfassen (ADR-0002 rev.: Bar dauerhaft, Bankkonten vorläufig bis Import).
//
// i18n + Mehrwährung (ADR-0004): alle sichtbaren Strings über t()/<Trans>, alles Geld über
// useGeld() (Parse bei Eingabe, Format + Symbol bei Anzeige).

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  istGeteilt,
  registerSicht,
  type Dublettenverdacht,
  type IstBuchung,
  type Kontensicht,
  type Registerzeile,
  type RegisterZeile,
  type Zahlungskonto,
} from "../../../application";
import {
  buchungenSammelbearbeiten,
  konten as kontenLaden,
  pruefmarkerSetzen,
  umbuchungErfassen,
} from "../../dienste";
import type { ScreenId } from "../bausteine/AppShell";
import { Button, Card, DataTable, FormField, Pill } from "../bausteine";
import { BuchungDetail } from "../buchung/BuchungDetail";
import { DublettenVergleich, type Vergleichsseite } from "../buchung/DublettenVergleich";
import { SammelDialog } from "../buchung/SammelDialog";
import { AbrufDialog } from "./AbrufDialog";
import { DepotAuszug } from "./DepotAuszug";
import { Auswahl } from "../bausteine/Auswahl";
import { CategoryPicker } from "../bausteine/CategoryPicker";
import { Datumsfeld } from "../bausteine/Datumsfeld";
import { Modal } from "../bausteine/Modal";
import { PageHead } from "../bausteine/PageHead";
import { IconButton } from "../bausteine/IconButton";
import { useGeld, useCharakterLabel, fehlerNachricht } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";

/** Stabil leer, damit die abgeleiteten Werte nicht bei jedem Render neu entstehen. */
const LEERE_NAMEN: ReadonlyMap<string, string> = new Map();
const LEERE_IDS: ReadonlySet<string> = new Set();

const TAGE_OPTIONEN = [14, 30, 60, 90];
const ART_OPTS = [
  { v: "alle", k: "konten.artAlle" },
  { v: "einnahmen", k: "konten.artEinnahmen" },
  { v: "ausgaben", k: "konten.artAusgaben" },
  { v: "umbuchung", k: "konten.artUmbuchung" },
] as const;

function heuteIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
/**
 * Datum einer Registerzeile — MIT Jahr. Ohne es liest sich eine Liste, die über den
 * Jahreswechsel reicht, als wäre alles aus demselben Jahr; im Register stehen aber alle
 * Buchungen eines Kontos, nicht nur die des laufenden Jahres.
 */
function datumKurz(iso: string): string {
  const [j, m, d] = iso.split("-");
  return `${d}.${m}.${j}`;
}

/** Dasselbe ohne Jahr — nur fuer die Vorschau, siehe die Spalte dort. */
function datumOhneJahr(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

export function KontenScreen({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const charakterLabel = useCharakterLabel();
  const heute = useMemo(heuteIso, []);
  const [sicht, setSicht] = useState<Kontensicht | null>(null);
  const [aktivId, setAktivId] = useState("");
  const [tage, setTage] = useState(30);
  const [katFilter, setKatFilter] = useState("alle");
  const [artFilter, setArtFilter] = useState<"alle" | "einnahmen" | "ausgaben" | "umbuchung">("alle");
  const [regSuche, setRegSuche] = useState("");
  /**
   * Nur die Zeilen zeigen, die womöglich doppelt im Konto stehen.
   *
   * Seit der Abruf direkt bucht, gibt es keine Vorstufe mehr, in der ein Zwilling
   * auffiele — die Frage „steht das schon drin?" gehört deshalb an den Auszug selbst.
   */
  const [nurDubletten, setNurDubletten] = useState(false);
  /** Das Paar, das gerade nebeneinander liegt — beide Seiten und der Grund. */
  const [vergleich, setVergleich] = useState<{ links: Vergleichsseite; rechts: Vergleichsseite; verdacht: Dublettenverdacht } | null>(null);
  const [buchenOffen, setBuchenOffen] = useState(false);
  const [umbuchenOffen, setUmbuchenOffen] = useState(false);
  const [editBuchung, setEditBuchung] = useState<IstBuchung | null>(null);
  /**
   * Massenbearbeitung — auf Wunsch, nicht immer. Eine dauerhafte Kästchenspalte macht
   * aus einer Leseansicht ein Formular; sie erscheint erst, wenn man sie einschaltet.
   */
  const [auswahlModus, setAuswahlModus] = useState(false);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [sammelOffen, setSammelOffen] = useState(false);
  const [abruf, setAbruf] = useState(false);
  /** Der Abgleich des Anfangsbestands — ein Eingriff, deshalb mit Vorschau. */
  const [fehler, setFehler] = useState<string | null>(null);

  // EIN Ladevorgang, EIN setState. Gestaffelte await/setState-Paare lassen abgeleitete
  // Werte kurz gegen leere Listen rechnen — der Empfänger einer importierten Buchung
  // käme aus einer noch leeren Umsatz-Liste und die Zeile zeigte für einen Render
  // „Buchung" statt „Nordhoff".
  async function laden() {
    const s = await kontenLaden();
    setSicht(s);
    setAktivId((id) => id || s.zeilen[0]?.konto.id || "");
  }
  useEffect(() => {
    laden();
  }, []);

  // Beim Kontowechsel die Filter zurücksetzen.
  useEffect(() => {
    setKatFilter("alle");
    setArtFilter("alle");
    setRegSuche("");
    setNurDubletten(false);
    // Die Auswahl gehört zum Register des Kontos — sie über einen Wechsel mitzunehmen
    // hiesse, Buchungen zu ändern, die man nicht mehr vor sich hat.
    setAuswahl(new Set());
  }, [aktivId]);

  const kontozeilen = sicht?.zeilen ?? [];
  const kategorien = sicht?.kategorien ?? [];
  const ist = sicht?.buchungen ?? [];
  const kontoName = sicht?.kontoNamen ?? LEERE_NAMEN;
  const ausBankabruf = sicht?.ausBankabruf ?? LEERE_IDS;
  const aktivZeile = kontozeilen.find((z) => z.konto.id === aktivId);
  const aktiv = aktivZeile?.konto;
  /**
   * Konten ohne Bankverbindung — die einzigen, auf denen von Hand gebucht wird.
   *
   * Auf einem abgerufenen Konto sagt die BANK, was daraufsteht. Eine von Hand angelegte
   * Zeile wäre dort eine Behauptung gegen den Kontoauszug: sie steht im Saldo, die Bank
   * kennt sie nicht, und beim nächsten Abgleich taucht die Differenz auf, ohne dass noch
   * jemand wüsste, woher sie kam. Was fehlt, holt der Abruf; was falsch ist, wird
   * verworfen.
   */
  const offlineKonten = useMemo(() => kontozeilen.filter((z) => !z.online).map((z) => z.konto), [kontozeilen]);

  const register = useMemo(
    () => (sicht && aktiv ? registerSicht(sicht, aktiv, heute, tage) : null),
    [sicht, aktiv, heute, tage],
  );

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);

  // Kategorien, die im gebuchten Register wirklich vorkommen (für das Filter-Dropdown).
  const kategorienImRegister = useMemo(() => {
    const ids = new Set<string>();
    for (const z of register?.gebucht ?? []) if (z.zeile.kategorieId) ids.add(z.zeile.kategorieId);
    return [...ids].map((id) => ({ id, name: kategorieName.get(id) ?? "?" })).sort((a, b) => a.name.localeCompare(b.name));
  }, [register, kategorieName]);

  const gebuchtGefiltert = useMemo(() => {
    const q = regSuche.trim().toLowerCase();
    // „12,50" soll die Zeile über 12,50 € finden, egal ob sie ein Zu- oder Abfluss ist.
    // Zwei Wege nebeneinander, weil beide gebraucht werden: der geparste Betrag trifft
    // exakt (auch „12" → 12,00), der formatierte Text erlaubt das Suchen nach Anfängen
    // („1.2" findet 1.234,56). Nur der Text allein hätte „12" nie auf 12,00 gebracht.
    const qBetrag = regSuche.trim() ? geld.parse(regSuche.trim()) : null;
    return (register?.gebucht ?? []).filter((r) => {
      const z = r.zeile;
      if (nurDubletten && !r.dublette) return false;
      if (katFilter === "__ohne" ? !!z.kategorieId : katFilter !== "alle" && z.kategorieId !== katFilter) return false;
      if (artFilter === "umbuchung" && !z.gegenkontoId) return false;
      if (artFilter === "einnahmen" && !(z.betrag > 0 && !z.gegenkontoId)) return false;
      if (artFilter === "ausgaben" && !(z.betrag < 0 && !z.gegenkontoId)) return false;
      if (q) {
        const heu = `${r.bezeichnung} ${r.verwendungszweck} ${r.kategorieName} ${geld.format(Math.abs(z.betrag))}`.toLowerCase();
        const trifftBetrag = qBetrag != null && Math.abs(z.betrag) === Math.abs(qBetrag);
        if (!heu.includes(q) && !trifftBetrag) return false;
      }
      return true;
    });
  }, [register, katFilter, artFilter, regSuche, nurDubletten, geld]);

  /**
   * Kategorie einer Zeile setzen oder leeren — direkt aus der Liste heraus.
   *
   * Über `buchungenSammelbearbeiten` mit genau einer Buchung und nicht über
   * `buchungBearbeiten`: der Sammelweg nimmt Betrag, Datum und Konto GAR NICHT an. Eine
   * Kategoriewahl kann damit an keiner anderen Angabe etwas verstellen, und das ist an
   * einer Stelle, die man beim Durchsehen im Vorbeigehen bedient, mehr wert als der
   * kürzere Aufruf. Er zieht ausserdem den Charakter mit und setzt die Herkunft auf
   * „manuell" — dieselben zwei Dinge, die auch der Dialog tut.
   *
   * `null` statt `""`: leeren ist eine Entscheidung („gehört in keine Kategorie") und
   * etwas anderes als „nicht angegeben".
   */
  async function kategorieZuweisen(b: IstBuchung, kategorieId: string) {
    setFehler(null);
    try {
      await buchungenSammelbearbeiten([b], { kategorieId: kategorieId || null }, [...kategorien]);
      await laden();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  /**
   * Baut die zwei Seiten eines Vergleichs. Fehlt der Zwilling im Ledger, kommt nichts
   * zurück — dann ist der Verdacht ohnehin veraltet und der Dialog hätte nur eine Spalte.
   */
  function vergleichOeffnen(buchung: IstBuchung, d: Dublettenverdacht) {
    const zwilling = d.zwillingIstId ? ist.find((b) => b.id === d.zwillingIstId) : undefined;
    if (!zwilling || !sicht) return;
    const seite = (b: IstBuchung): Vergleichsseite => {
      const u = sicht.umsatzZuBuchung.get(b.id);
      return {
        buchung: b,
        umsatz: u,
        lauf: u ? sicht.laeufe.find((l) => l.id === u.laufId) : undefined,
        kontoName: kontoName.get(b.kontoId) ?? "",
        kategorieName: b.kategorieId ? kategorieName.get(b.kategorieId) ?? "" : "",
      };
    };
    // Die ältere Zeile steht links: eine Leserichtung, die nicht davon abhängt, welche
    // der beiden man angeklickt hat.
    const [links, rechts] = buchung.datum <= zwilling.datum ? [buchung, zwilling] : [zwilling, buchung];
    setVergleich({ links: seite(links), rechts: seite(rechts), verdacht: d });
  }

  /** Wie viele Zeilen des Registers überhaupt einen Verdacht tragen. */
  const dublettenAnzahl = useMemo(
    () => (register?.gebucht ?? []).filter((r) => r.dublette).length,
    [register],
  );

  // Ist der letzte Verdacht erledigt, verschwindet der Filterknopf — der Filter selbst
  // blieb bisher an und liess eine leere Tabelle zurück, ohne dass noch etwas dastand,
  // womit man ihn wieder ausschaltet. Der Erfolg sah aus wie ein Datenverlust.
  useEffect(() => {
    if (dublettenAnzahl === 0) setNurDubletten(false);
  }, [dublettenAnzahl]);

  // Standardansicht: neueste zuerst (Tabelle sortiert/paginiert intern weiter).
  const gebuchtFuerTabelle = useMemo(() => [...gebuchtGefiltert].reverse(), [gebuchtGefiltert]);

  /** Die markierten Zeilen als echte Buchungen — nur die, die es noch gibt. */
  const gewaehlteBuchungen = useMemo(
    () => ist.filter((b) => auswahl.has(b.id)),
    [ist, auswahl],
  );

  function auswahlUmschalten(id: string) {
    setAuswahl((bisher) => {
      const neu = new Set(bisher);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });
  }

  /**
   * Alles-Markieren bezieht sich auf das GEFILTERTE Register, nicht auf die sichtbare
   * Seite. Wer nach „Nordhoff" filtert und alles markiert, meint alle Nordhoff-Zeilen — nicht
   * die ersten fünfundzwanzig davon.
   */
  const alleIds = useMemo(
    () => gebuchtGefiltert.map((r) => r.zeile.istId).filter((x): x is string => !!x),
    [gebuchtGefiltert],
  );
  const alleGewaehlt = alleIds.length > 0 && alleIds.every((id) => auswahl.has(id));





  return (
    <div className="screen">
      <PageHead title={t("konten.titel")} subtitle={t("konten.untertitel")} />

      <Card
        title={t("konten.deineKonten")}
        subtitle={t("konten.deineKontenUntertitel")}
        action={
          <span style={{ display: "flex", gap: "var(--sp-2)" }}>
            {/* Nur zeigen, wenn es überhaupt etwas abzurufen gibt — ein Knopf, der
                nichts tun kann, ist eine Frage an den Nutzer statt einer Antwort. */}
            {kontozeilen.some((z) => z.online) && (
              <Button variant="primary" onClick={() => setAbruf(true)}>{t("konten.abrufen")}</Button>
            )}
            <Button plus onClick={() => onNavigate("kontenverwaltung")}>{t("konten.kontoAnlegen")}</Button>
          </span>
        }
      >
        {kontozeilen.length === 0 ? (
          <div className="muted">{t("konten.keineKonten")}</div>
        ) : (
          <DataTable
            sortable
            onRowClick={(z) => setAktivId(z.konto.id)}
            istAktiv={(z) => z.konto.id === aktivId}
            columns={[
              { key: "bezeichnung", label: t("konten.spalteBezeichnung"), render: (z) => (<span style={{ fontWeight: z.konto.id === aktivId ? "var(--fw-bold)" : "var(--fw-semi)" }}>{z.konto.bezeichnung}</span>) },
              { key: "typ", label: t("konten.spalteTyp"), sortValue: (z) => z.konto.typ, render: (z) => <Pill variant="neutral">{t(`konten.typ.${z.konto.typ}`)}</Pill> },
              {
                key: "verbindung",
                label: t("konten.spalteVerbindung"),
                sortValue: (z) => (z.online ? "0" : "1"),
                render: (z) =>
                  z.online ? (
                    <Pill variant="ok">{t("konten.online")}</Pill>
                  ) : (
                    <Pill variant="neutral">{t("konten.offline")}</Pill>
                  ),
              },
              { key: "ist", label: `${t("konten.spalteIst")} ${geld.symbol}`, align: "right", sortValue: (z) => z.bewegungen, render: (z) => (z.bewegungen ? geld.format(z.bewegungen, { mitVorzeichen: true }) : "—") },
              {
                key: "real",
                label: `${t("konten.spalteRealerStand")} ${geld.symbol}`,
                align: "right",
                // Ein Depot-Konto hat keine Buchungen; sein realer Stand waere dauerhaft
                // null, waehrend der Wert daneben in der Wertreihe steht. Gezeigt wird
                // deshalb der zuletzt gemeldete Depotwert - mit dem Stichtag im Titel,
                // damit er nicht wie ein gerechneter Saldo aussieht.
                sortValue: (z) => z.depot?.aktuell?.gesamtwert ?? z.realerStand,
                render: (z) =>
                  z.depot ? (
                    <span
                      style={{ fontWeight: "var(--fw-bold)" }}
                      title={t("depot.standErklaerung", { datum: z.depot.aktuell?.stichtag ?? "—" })}
                    >
                      {z.depot.aktuell ? geld.format(z.depot.aktuell.gesamtwert) : "—"}
                      <span className="muted" style={{ fontSize: "var(--fs-xs)", marginLeft: "var(--sp-1)" }}>
                        {t("depot.bezeichnung")}
                      </span>
                    </span>
                  ) : (
                    <span style={{ fontWeight: "var(--fw-bold)" }}>{geld.format(z.realerStand)}</span>
                  ),
              },
            ]}
            rows={[...kontozeilen]}
          />
        )}
      </Card>


      {abruf && (
        <AbrufDialog
          onClose={() => setAbruf(false)}
          onFertig={() => void laden()}
        />
      )}

      {/* Ein Depot-Konto bekommt den Bestand statt des Auszugs: es hat keine Bewegungen,
          und die gewohnte Liste stünde dauerhaft leer. */}
      {aktiv && aktivZeile?.depot && <DepotAuszug konto={aktiv} sicht={aktivZeile.depot} />}

      {aktiv && register && !aktivZeile?.depot && (
        <Card
          style={{ marginTop: "var(--gap-card)" }}
          pad
        >
          {/* Statement-Masthead: wessen Auszug, welcher reale Stand */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--sp-4)", flexWrap: "wrap", marginBottom: "var(--sp-4)" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: "var(--fs-h3)", fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-h)" }}>{aktiv.bezeichnung}</span>
                <Pill variant="neutral">{t(`konten.typ.${aktiv.typ}`)}</Pill>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)", marginTop: 8 }}>
                <span className="num" style={{ fontSize: "var(--fs-h1)", fontWeight: "var(--fw-black)", letterSpacing: "var(--ls-tight)", lineHeight: 1, color: register.standHeute < 0 ? "var(--warn-deep)" : "var(--ink)" }}>
                  {geld.formatMitSymbol(register.standHeute)}
                </span>
                <span style={{ fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-bold)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--ink-3)" }}>{t("konten.realerStandLabel")}</span>
              </div>
              {/* Woraus die grosse Zahl darüber besteht — ausgeschrieben statt als
                  „Anfangsbestand X · Σ Ist Y". Die alte Fassung nannte
                  zwei Zahlen und verschwieg, dass sie zusammen genau den Stand darüber
                  ergeben; „Σ Ist" hiess dabei nichts, was ausserhalb des Codes jemand
                  wissen konnte. */}
              <div className="muted" style={{ fontSize: "var(--fs-xs)", marginTop: 6 }}>
                {t("konten.standHerkunft", {
                  anfang: geld.formatMitSymbol(aktiv.saldo),
                  bewegung: geld.formatMitSymbol(aktivZeile?.bewegungen ?? 0, { mitVorzeichen: true }),
                })}
              </div>

              {/* Der Abgleich gegen eine unabhängige Quelle. Ohne ihn ist der Stand oben
                  nur in sich schlüssig — er kann vollständig aussehen und trotzdem eine
                  Buchung vermissen. Die Differenz macht daraus eine Aussage: null heißt
                  beweisbar vollständig, alles andere benennt, wieviel fehlt.
                  Vorzeichen mit Bedeutung: die Quelle hat mehr (+) → es fehlt eine
                  Einnahme; die App hat mehr (−) → eine Ausgabe fehlt oder etwas ist
                  doppelt drin.

                  Und seit es eine Anker-HISTORIE gibt, steht darunter die Auskunft, die
                  wirklich weiterhilft: nicht nur wieviel fehlt, sondern seit wann. */}
              {/* Nur noch die AUSKUNFT, nicht mehr der Arbeitsplatz.
                  Ob der Stand stimmt, will man hier sehen — warum er nicht stimmt und was
                  dagegen zu tun ist, ist eine eigene Frage mit eigenem Platz (Verwaltung →
                  Konten → Abgleich). Sie stand hier als Pille mit einer Zahl, die sagt
                  „irgendwo fehlen 600 Euro", ohne hinzuzeigen — die Auskunft, die am
                  wenigsten hilft. */}
              {aktivZeile?.anker && (
                <div style={{ fontSize: "var(--fs-xs)", marginTop: 6, display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", alignItems: "baseline" }}>
                  <Pill variant={(aktivZeile.abweichung ?? 0) === 0 ? "ok" : "warn"}>
                    {(aktivZeile.abweichung ?? 0) === 0
                      ? t("konten.abgleich.stimmt")
                      : t("konten.abgleich.differenz", { betrag: geld.formatMitSymbol(aktivZeile.abweichung ?? 0, { mitVorzeichen: true }) })}
                  </Pill>
                  {(aktivZeile.abweichung ?? 0) !== 0 && (
                    <button className="linkbtn" style={{ padding: 0 }} onClick={() => onNavigate("kontenverwaltung")}>
                      {t("konten.abgleichBereich.hinweg")}
                    </button>
                  )}
                </div>
              )}

            </div>
            <span style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
              {/* Umbuchen legt ZWEI neue Buchungen an — beide müssen auf Konten landen,
                  die von Hand geführt werden. Für die Gegenseite einer Bank-Abhebung gibt
                  es den anderen Weg: im Detail der abgerufenen Zeile das Gegenbein
                  erzeugen. Dort erfindet niemand die Bankbuchung, sie ist schon da.

                  Deshalb steht der Knopf auch nur an einem OFFLINE-Konto: die Umbuchung
                  geht immer VON dem Auszug aus, der gerade offen ist (`vonId={aktivId}`).
                  Bei einem Online-Konto wäre die Ausgangsseite eine, auf der von Hand gar
                  nicht gebucht werden darf — der Dialog bot sie an und konnte sie nicht
                  einlösen; `UmbuchungModal` fiel dann still auf das erste Konto seiner
                  Liste zurück. Für den Zufluss auf einem Online-Konto ist derselbe Weg
                  zuständig wie für den Abfluss: das Gegenbein aus der abgerufenen Zeile. */}
              {aktivZeile && !aktivZeile.online && offlineKonten.length >= 2 && (
                <Button plus onClick={() => { setFehler(null); setUmbuchenOffen(true); }}>{t("konten.umbuchen")}</Button>
              )}
              {aktivZeile && !aktivZeile.online && (
                <Button variant="primary" plus onClick={() => { setFehler(null); setBuchenOffen(true); }}>{t("konten.btnBuchung")}</Button>
              )}
            </span>
          </div>

          {fehler && <div className="err" style={{ marginTop: 10 }}>{fehler}</div>}
        </Card>
      )}

      {/* Gebucht und Geplant stehen NEBENEINANDER, und jedes in einer EIGENEN Karte.

          Nebeneinander, weil die geplante Liste untereinander erst nach der ganzen
          Buchungstabelle erreichbar war — bei einem Konto mit Historie also nach zwei
          Bildschirmhöhen Scrollen, obwohl gerade sie die Frage „was kommt noch"
          beantwortet.

          In zwei Karten, weil es zwei Sachen sind. In einer Karte waren es zwei Tabellen
          unter einer Fläche, und die Überschriften mussten die Trennung allein tragen,
          die eine Karte von sich aus leistet. Sie liegen NEBEN der Auszugs-Karte und nicht
          darin — keine Karte in einer Karte (siehe ui/CLAUDE.md), geprüft in
          `kartenschachtelung.test.tsx`.

          Die Aufteilung ist der goldene Schnitt zugunsten der Buchungen (1,618 : 1): die
          haben sieben Spalten und einen Seitenschalter, die Vorschau fünf. Ein hälftiger
          Schnitt gäbe der schmaleren Seite Platz, den sie nicht braucht, und nähme ihn der
          breiteren. Unter 1440 px stapelt es wieder — zwei waagerecht scrollende Tabellen
          nebeneinander sind keine. */}
      {aktiv && register && !aktivZeile?.depot && (
        <div className="auszug-spalten">
          <Card title={t("konten.gebuchtTitel")}>
          {/* Filterleiste: Suche · Art (segmented) · Kategorie · Treffer */}
          <div className="tabellenfilter" style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
            <span style={{ position: "relative", flex: "1 1 200px", minWidth: 160, display: "inline-flex", alignItems: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2.2" style={{ position: "absolute", left: 10, pointerEvents: "none" }}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
              <input className="field" style={{ width: "100%", paddingLeft: 30 }} value={regSuche} onChange={(e) => setRegSuche(e.target.value)} placeholder={t("konten.suche")} />
            </span>
            <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface)" }}>
              {ART_OPTS.map((opt, i) => {
                const an = artFilter === opt.v;
                return (
                  <button key={opt.v} type="button" aria-pressed={an} onClick={() => setArtFilter(opt.v)} style={{ padding: "6px 11px", fontSize: "12.5px", fontWeight: an ? "var(--fw-bold)" : "var(--fw-semi)", fontFamily: "var(--font-ui)", border: "none", borderLeft: i ? "1px solid var(--line-soft)" : "none", background: an ? "var(--accent-wash)" : "transparent", color: an ? "var(--accent-deep)" : "var(--ink-2)", cursor: "pointer", whiteSpace: "nowrap" }}>
                    {t(opt.k)}
                  </button>
                );
              })}
            </div>
            <Auswahl
              ariaLabel={t("konten.alleKategorien")}
              wert={katFilter}
              aufAenderung={setKatFilter}
              optionen={[
                { wert: "alle", text: t("konten.alleKategorien") },
                ...kategorienImRegister.map((k) => ({ wert: k.id, text: k.name })),
                { wert: "__ohne", text: t("konten.ohneKategorie") },
              ]}
            />
            <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>{t("konten.buchungenAnzahl", { n: gebuchtGefiltert.length })}</span>
            {/* Erscheint nur, wenn es etwas zu sehen gibt. Ein Schalter, der dauerhaft
                „0 mögliche Dubletten" anbietet, ist eine Frage ohne Antwort. */}
            {dublettenAnzahl > 0 && (
              <button
                type="button"
                aria-pressed={nurDubletten}
                onClick={() => setNurDubletten((x) => !x)}
                style={{
                  padding: "5px 10px", fontSize: "12.5px", fontFamily: "var(--font-ui)",
                  fontWeight: "var(--fw-bold)", borderRadius: "var(--r-md)", cursor: "pointer",
                  border: "1px solid var(--warn, var(--line))",
                  background: nurDubletten ? "var(--warn, #b8860b)" : "var(--warn-wash, transparent)",
                  color: nurDubletten ? "var(--surface, #fff)" : "var(--warn-deep, var(--ink-2))",
                  whiteSpace: "nowrap",
                }}
              >
                {t("konten.dubletten.filter", { n: dublettenAnzahl })}
              </button>
            )}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--fs-xs)", color: "var(--ink-2)", cursor: "pointer", whiteSpace: "nowrap" }}>
              <input
                type="checkbox"
                checked={auswahlModus}
                onChange={(e) => { setAuswahlModus(e.target.checked); if (!e.target.checked) setAuswahl(new Set()); }}
                style={{ accentColor: "var(--accent-deep)", cursor: "pointer" }}
              />
              {t("konten.sammel.modus")}
            </label>
          </div>

          {/* Die Aktionsleiste erscheint erst, wenn etwas markiert ist — vorher gäbe es
              nichts zu tun, und ein grauer Knopf ist eine Frage ohne Antwort. */}
          {auswahlModus && auswahl.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-3)", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--accent-wash)" }}>
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-bold)", color: "var(--accent-deep)" }}>
                {t("konten.sammel.gewaehlt", { n: auswahl.size })}
              </span>
              <Button variant="primary" onClick={() => setSammelOffen(true)}>{t("konten.sammel.bearbeiten")}</Button>
              <button className="linkbtn" onClick={() => setAuswahl(new Set())}>{t("konten.sammel.aufheben")}</button>
            </div>
          )}

          {gebuchtGefiltert.length === 0 ? (
            <div className="muted">{t("konten.keineGebucht")}</div>
          ) : (
            <DataTable
              key={`${aktivId}-${katFilter}-${artFilter}-${regSuche}`}
              pageSize={25}
              labelSeite={t("konten.seite")}
              labelErste={t("konten.seiteErste")}
              labelLetzte={t("konten.seiteLetzte")}
              labelZurueck={t("konten.seiteZurueck")}
              labelVor={t("konten.seiteVor")}
              columns={[
                // Die Auswahlspalte gibt es nur im Auswahlmodus — sonst hätte jede Zeile
                // dauerhaft ein Kästchen, das in neun von zehn Sitzungen niemand braucht.
                ...(auswahlModus
                  ? [{
                      key: "_sel",
                      label: (
                        <input
                          type="checkbox"
                          checked={alleGewaehlt}
                          aria-label={t("konten.sammel.alleWaehlen")}
                          onChange={() => setAuswahl(alleGewaehlt ? new Set() : new Set(alleIds))}
                          style={{ accentColor: "var(--accent-deep)", cursor: "pointer" }}
                        />
                      ),
                      sortable: false,
                      render: (r: Registerzeile) =>
                        r.zeile.istId ? (
                          <input
                            type="checkbox"
                            checked={auswahl.has(r.zeile.istId)}
                            aria-label={t("konten.sammel.zeileWaehlen")}
                            onChange={() => auswahlUmschalten(r.zeile.istId!)}
                            style={{ accentColor: "var(--accent-deep)", cursor: "pointer" }}
                          />
                        ) : null,
                    }]
                  : []),
                { key: "datum", label: t("konten.spalteDatum"), render: (r) => datumKurz(r.zeile.datum) },
                {
                  // Nicht umbrechen (flexWrap): eine zweizeilige Zeile schiebt den
                  // Seitenschalter darunter je nach Seiteninhalt nach oben oder unten,
                  // und beim Durchblättern klickt man daneben. Der volle Text steht im
                  // title, für die Fälle, in denen abgeschnitten wird.
                  key: "bez", label: t("konten.spalteBeschreibung"), maxWidth: 320,
                  render: (r) => (
                    <span title={r.bezeichnung} style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "nowrap", maxWidth: "100%" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.bezeichnung}</span>
                      {r.zeile.gegenkontoId && <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{r.zeile.betrag < 0 ? "→" : "←"} {kontoName.get(r.zeile.gegenkontoId) ?? "?"}</span>}
                      {/* Der Prüf-Marker steht VOR den anderen Pillen: die übrigen sagen,
                          was eine Zeile IST, dieser sagt, was noch zu tun ist. Klick nimmt
                          ihn weg — dafür ist er ein Knopf und kein Etikett.
                          Warnfarbe und Imperativ, weil er eine AUFFORDERUNG ist; grün und
                          „erledigt" lasen sich als Haken und damit als das Gegenteil. */}
                      {r.buchung?.zuPruefen && (
                        <button
                          type="button"
                          aria-label={t("konten.pruefenWeg")}
                          title={t("konten.pruefenWeg")}
                          style={{ flex: "0 0 auto", display: "inline-flex", background: "none", border: 0, padding: 0, cursor: "pointer" }}
                          onClick={async (e) => {
                            e.stopPropagation();
                            await pruefmarkerSetzen(r.buchung!.id, false);
                            await laden();
                          }}
                        >
                          <Pill variant="warn">{t("konten.pillZuPruefen")}</Pill>
                        </button>
                      )}
                      {!r.zeile.gegenkontoId && (r.zeile.quelle === "manuell" ? <Pill variant="neutral">{t("konten.pillManuell")}</Pill> : r.zeile.quelle === "bezahlt-markiert" ? <Pill variant="neutral">{t("konten.pillBezahlt")}</Pill> : null)}
                      {/* Der Verdacht steht an BEIDEN Zeilen — es gibt kein Original.
                          Die Gründe hängen im title, entschieden wird im Detail. */}
                      {r.dublette && (
                        // Der title sitzt am Wrapper, nicht an der Pille: `bausteine/` ist teils aus
                        // dem Design-System kopiert und kennt die Eigenschaft nicht —
                        // dort wird nichts erfunden.
                        <button
                          type="button"
                          aria-label={t("konten.vergleich.oeffnen")}
                          style={{ flex: "0 0 auto", display: "inline-flex", background: "none", border: 0, padding: 0, cursor: "pointer" }}
                          title={`${r.dublette.gruende.join(" · ")} · ${t("konten.dubletten.zwilling", { datum: r.dublette.zwillingDatum })} · ${t("konten.vergleich.oeffnen")}`}
                          onClick={(e) => {
                            // Die Zeile selbst öffnet das Detail — der Vergleich ist eine
                            // eigene Frage und darf sie nicht mitauslösen.
                            e.stopPropagation();
                            if (r.buchung && r.dublette) vergleichOeffnen(r.buchung, r.dublette);
                          }}
                        >
                          <Pill variant="warn">
                            {t(r.dublette.urteil === "identisch" ? "konten.dubletten.sicher" : "konten.dubletten.verdacht")}
                          </Pill>
                        </button>
                      )}
                    </span>
                  ),
                },
                {
                  // Die Umbuchungs-Pille steht HIER, nicht bei der Beschreibung: eine
                  // Umbuchung trägt keine Kategorie (sie verschiebt nur eigenes Geld),
                  // die Pille sagt also genau das, was in dieser Spalte fehlt. Vorher
                  // stand sie rechts neben dem Empfänger und die Kategorie-Spalte zeigte
                  // daneben einen Strich — zwei Zeichen für dieselbe Aussage.
                  key: "kat", label: t("konten.spalteKategorie"), maxWidth: 180,
                  sortValue: (r) => (r.zeile.gegenkontoId ? "" : r.kategorieName),
                  // Die Kategorie ist hier ÄNDERBAR, nicht nur abzulesen.
                  //
                  // Sie ist die Angabe, die nach einem Import am häufigsten nicht stimmt,
                  // und sie stand in einer Spalte, die aussah wie eine Anzeige: wer sie
                  // korrigieren wollte, musste den Dialog öffnen, eine Kategorie wählen,
                  // speichern und schliessen — vier Schritte für eine Entscheidung, die
                  // man beim Durchsehen der Liste schon getroffen hat.
                  //
                  // Zwei Zeilen bekommen den Wähler NICHT, und beide aus demselben Grund:
                  // sie haben keine EINE Kategorie, in die eine Wahl passen würde. Ein
                  // Umbuchungs-Bein trägt gar keine (es verschiebt eigenes Geld), eine
                  // aufgeteilte Buchung trägt mehrere. Bei ihnen bliebe unklar, was ein
                  // Klick eigentlich täte.
                  //
                  // Die aufgeteilte Zeile zeigt dafür eine PILLE und keinen Strich: sie
                  // trägt keine Kategorie, weil die Teile die Wahrheit sind — nicht, weil
                  // niemand eine vergeben hätte. Ein Strich sagte hier „noch
                  // einzusortieren" und schickte auf die Suche nach einer Lücke, die
                  // keine ist.
                  render: (r) =>
                    r.zeile.gegenkontoId
                      ? <Pill variant="um">{t("konten.pillUmbuchung")}</Pill>
                      : r.buchung && istGeteilt(r.buchung)
                        ? <Pill variant="neutral">{t("konten.split.pille")}</Pill>
                        : r.buchung
                          ? (
                              <CategoryPicker
                                kompakt
                                ariaLabel={t("konten.spalteKategorie")}
                                kategorien={[...kategorien]}
                                value={r.zeile.kategorieId ?? ""}
                                onChange={(id) => void kategorieZuweisen(r.buchung!, id)}
                              />
                            )
                          : r.kategorieName || "—",
                },
                { key: "betrag", label: `${t("konten.spalteBetrag")} ${geld.symbol}`, align: "right", sortValue: (r) => r.zeile.betrag, render: (r) => <span className="num" style={{ fontWeight: 700, color: geldFarbe(r.zeile.betrag) }}>{geld.format(r.zeile.betrag, { mitVorzeichen: true })}</span> },
                { key: "saldo", label: `${t("konten.spalteSaldo")} ${geld.symbol}`, align: "right", sortValue: (r) => r.zeile.saldo, render: (r) => geld.format(r.zeile.saldo) },
                {
                  key: "_a", label: "", align: "right", sortable: false,
                  render: (r) => <IconButton icon="bearbeiten" label={t("konten.bearbeiten")} onClick={() => r.buchung && setEditBuchung(r.buchung)} />,
                },
              ]}
              rows={gebuchtFuerTabelle}
              // Gebucht, aber der Buchungstag liegt noch vor uns: die Bank fuehrt die
              // Zeile bereits im Saldo, passiert ist sie noch nicht. Sie steht deshalb
              // hier oben und nicht unter „geplant" — gedaempft, damit man den
              // Unterschied sieht, statt sich spaeter ueber sie zu wundern.
              rowStyle={(r: Registerzeile) => (r.zeile.zukuenftig ? { opacity: 0.55 } : undefined)}
            />
          )}
          </Card>

          {/* Die geplante Vorschau.
              Der Stand von heute steht als Unterzeile der Karte und nicht mehr als Trenner
              quer über den Auszug: er ist der Punkt, ab dem die Vorschau rechnet, und
              gehört damit an ihren Anfang. Zwischen zwei Listen stehend beschriftete er
              beide und keine.

              Der Zeitraum-Wähler sitzt im `action` der Karte und nicht mehr oben bei den
              Knöpfen: er stellt ausschliesslich ein, wie weit DIESE Liste nach vorn
              schaut. Neben „Buchung erfassen" sah er aus wie eine Einstellung des ganzen
              Auszugs. */}
          <Card
            title={t("konten.geplantTitel")}
            subtitle={t("konten.heuteRealerStand", { stand: geld.format(register.standHeute), symbol: geld.symbol })}
            action={
              <span className="tabellenfilter">
                <Auswahl
                  ariaLabel={t("konten.zeitraumWaehlen")}
                  wert={String(tage)}
                  aufAenderung={(v) => setTage(Number(v))}
                  optionen={TAGE_OPTIONEN.map((d) => ({ wert: String(d), text: t("konten.kommendeTage", { tage: d }) }))}
                />
              </span>
            }
          >
            {register.geplant.length === 0 ? (
              <div className="muted">{t("konten.keineGeplanten", { tage })}</div>
            ) : (
              <DataTable
                columns={[
                  {
                    // OHNE Jahr, anders als im Auszug links. Dort stehen alle Buchungen
                    // eines Kontos, und ueber den Jahreswechsel hinweg waere „12.08."
                    // zweideutig. Die Vorschau reicht hoechstens 90 Tage nach vorn — dort
                    // unterscheidet das Jahr nichts und kostet nur Spaltenbreite, die
                    // diese schmale Tabelle nicht hat.
                    key: "datum", label: t("konten.spalteDatum"),
                    render: (z: RegisterZeile) => datumOhneJahr(z.datum),
                  },
                  {
                    key: "bez", label: t("konten.spalteBeschreibung"), maxWidth: 220,
                    render: (z: RegisterZeile) => (
                      <span title={z.bezeichnung} style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "nowrap", maxWidth: "100%" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.bezeichnung}</span>
                        {z.charakter === "Umschichtung" && <Pill variant="um">{charakterLabel("Umschichtung")}</Pill>}
                      </span>
                    ),
                  },
                  {
                    key: "betrag", label: `${t("konten.spalteBetrag")} ${geld.symbol}`, align: "right",
                    render: (z: RegisterZeile) => <span className="num" style={{ fontWeight: 700, color: geldFarbe(z.betrag) }}>{geld.format(z.betrag, { mitVorzeichen: true })}</span>,
                  },
                  { key: "saldo", label: `${t("konten.spalteSaldo")} ${geld.symbol}`, align: "right", render: (z: RegisterZeile) => geld.format(z.saldo) },
                ]}
                rows={[...register.geplant]}
                // Gedämpft wie zuvor: nichts davon ist passiert. Der Unterschied zu einer
                // gebuchten Zeile muss sichtbar bleiben, auch wenn beide jetzt in einer
                // Tabelle stehen.
                rowStyle={() => ({ opacity: 0.62 })}
              />
            )}
          </Card>
        </div>
      )}

      {/* Anlegen und Bearbeiten sind derselbe Dialog: ohne `buchung` legt er eine neue an,
          vorbelegt mit dem Konto, dessen Register gerade offen ist. */}
      {buchenOffen && aktiv && (
        <BuchungDetail
          vorgabe={{ kontoId: aktiv.id, datum: heute }}
          onClose={() => setBuchenOffen(false)}
          onGeaendert={laden}
        />
      )}

      {editBuchung && (
        <BuchungDetail
          buchung={editBuchung}
          // Was die BANK geliefert hat, wird verworfen statt gelöscht: gelöscht käme es
          // beim nächsten Abruf zurück. Was aus einer Datei kam, hat diese Bindung nicht
          // und wird schlicht gelöscht.
          ausBankabruf={ausBankabruf.has(editBuchung.id)}
          onClose={() => setEditBuchung(null)}
          onGeaendert={laden}
        />
      )}

      {vergleich && (
        <DublettenVergleich
          links={vergleich.links}
          rechts={vergleich.rechts}
          verdacht={vergleich.verdacht}
          onClose={() => setVergleich(null)}
          onGeaendert={laden}
        />
      )}

      {sammelOffen && (
        <SammelDialog
          buchungen={gewaehlteBuchungen}
          kategorien={[...kategorien]}
          gesperrteIds={ausBankabruf}
          onClose={() => setSammelOffen(false)}
          onGeaendert={async () => { setAuswahl(new Set()); await laden(); }}
        />
      )}

      {umbuchenOffen && aktiv && (
        <UmbuchungModal
          konten={offlineKonten}
          vonId={aktivId}
          heute={heute}
          onClose={() => setUmbuchenOffen(false)}
          onSaved={async () => { setUmbuchenOffen(false); await laden(); }}
        />
      )}
    </div>
  );
}

function UmbuchungModal({ konten, vonId, heute, onClose, onSaved }: { konten: Zahlungskonto[]; vonId: string; heute: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  // Vorbelegt wird das aktive Konto nur, wenn es überhaupt in der Liste steht: ist gerade
  // ein Online-Konto gewählt, fehlt es hier, und ein `value`, das keine Option trifft,
  // zeigt im Browser stumm die erste an — gespeichert würde dann ein anderes Konto als
  // das angezeigte.
  const [von, setVon] = useState(konten.some((k) => k.id === vonId) ? vonId : konten[0]?.id ?? "");
  const [nach, setNach] = useState(konten.find((k) => k.id !== vonId)?.id ?? "");
  const [datum, setDatum] = useState(heute);
  const [betrag, setBetrag] = useState("");
  const [notiz, setNotiz] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    setFehler(null);
    try {
      await umbuchungErfassen({ vonKontoId: von, nachKontoId: nach, datum, betrag: geld.parse(betrag) ?? 0, notiz });
      onSaved();
    } catch (e) {
      setFehler(fehlerNachricht(t, e));
    }
  }

  return (
    <Modal
      title={t("konten.umbuchung.titel")}
      subtitle={t("konten.umbuchung.untertitel")}
      onClose={onClose}
      footer={<><Button variant="primary" onClick={speichern}>{t("konten.speichern")}</Button><button className="linkbtn" onClick={onClose}>{t("konten.abbrechen")}</button>{fehler && <span className="err">{fehler}</span>}</>}
    >
      <div className="form-grid">
        <FormField label={t("konten.umbuchung.vonKonto")} required>
          <Auswahl
            ariaLabel={t("konten.umbuchung.vonKonto")}
            wert={von}
            aufAenderung={setVon}
            optionen={konten.map((k) => ({ wert: k.id, text: k.bezeichnung }))}
          />
        </FormField>
        <FormField label={t("konten.umbuchung.nachKonto")} required>
          <Auswahl
            ariaLabel={t("konten.umbuchung.nachKonto")}
            wert={nach}
            aufAenderung={setNach}
            optionen={konten.map((k) => ({ wert: k.id, text: k.bezeichnung }))}
          />
        </FormField>
        <FormField label={t("konten.feldDatum")} required>
          <Datumsfeld ariaLabel={t("konten.feldDatum")} wert={datum} aufAenderung={setDatum} />
        </FormField>
        <FormField label={t("konten.feldBetrag")} required>
          <input className="field" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder={geld.format(0)} />
        </FormField>
        <FormField label={t("konten.feldBezeichnung")} hint={t("konten.optional")}>
          <input className="field" aria-label={t("konten.feldBezeichnung")} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder={t("konten.umbuchung.notizPlatzhalter")} />
        </FormField>
      </div>
    </Modal>
  );
}
