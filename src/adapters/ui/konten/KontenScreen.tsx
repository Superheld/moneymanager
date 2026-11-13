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
  type Belegungssicht,
  type Kontensicht,
  type Registerzeile,
  type Vertrag,
} from "../../../application";
import {
  buchungenSammelbearbeiten,
  kontobelegung,
  konten as kontenLaden,
  letztesKonto,
  letztesKontoMerken,
  pruefmarkerSetzen,
  vertragsliste,
} from "../../dienste";
import type { ScreenId } from "../bausteine/AppShell";
import { Button, Card, DataTable, Pill } from "../bausteine";
import { VormerkungsBlock } from "./VormerkungsBlock";
import { UmbuchungModal } from "./UmbuchungModal";
import { useRegisterfilter } from "./useRegisterfilter";
import { useSammelauswahl } from "../bausteine/useSammelauswahl";
import { BuchungDetail } from "../buchung/BuchungDetail";
import { DublettenVergleich, type Vergleichsseite } from "../buchung/DublettenVergleich";
import { SammelDialog } from "../buchung/SammelDialog";
import { AbrufDialog } from "../bausteine/AbrufDialog";
import { DepotAuszug } from "./DepotAuszug";
import { BelegungKarte } from "./BelegungKarte";
import { Auswahl } from "../bausteine/Auswahl";
import { CategoryPicker } from "../bausteine/CategoryPicker";
import { PageHead } from "../bausteine/PageHead";
import { IconButton } from "../bausteine/IconButton";
import { useDatum, useGeld, fehlerNachricht } from "../bausteine/einstellungenKontext";
import { geldFarbe } from "../bausteine/geldFarbe";
import { Kaestchen } from "../bausteine/Kaestchen";
import { Umschalter } from "../bausteine/Umschalter";
import { Toggle } from "@base-ui/react/toggle";
import { Button as BaseButton } from "@base-ui/react/button";
import { fehlerMelden } from "../bausteine/Meldungen";

/** Stabil leer, damit die abgeleiteten Werte nicht bei jedem Render neu entstehen. */
const LEERE_NAMEN: ReadonlyMap<string, string> = new Map();
const LEERE_IDS: ReadonlySet<string> = new Set();

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
export function KontenScreen({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const { t } = useTranslation();
  const geld = useGeld();
  // MIT Jahr. Ohne es liest sich eine Liste, die über den Jahreswechsel reicht, als wäre
  // alles aus demselben Jahr; im Register stehen alle Buchungen eines Kontos.
  const datum = useDatum();
  const heute = useMemo(heuteIso, []);
  const [sicht, setSicht] = useState<Kontensicht | null>(null);
  const [aktivId, setAktivIdRoh] = useState("");
  /** Das Paar, das gerade nebeneinander liegt — beide Seiten und der Grund. */
  const [vergleich, setVergleich] = useState<{ links: Vergleichsseite; rechts: Vergleichsseite; verdacht: Dublettenverdacht } | null>(null);
  const [buchenOffen, setBuchenOffen] = useState(false);
  const [umbuchenOffen, setUmbuchenOffen] = useState(false);
  const [editBuchung, setEditBuchung] = useState<IstBuchung | null>(null);
  /** Die Sammelbearbeitung (Dialog) über die markierten Zeilen — siehe `useSammelauswahl`. */
  const [sammelOffen, setSammelOffen] = useState(false);
  const [vertraege, setVertraege] = useState<Vertrag[]>([]);
  const [abruf, setAbruf] = useState(false);
  /** Wem das Geld auf jedem Konto gehört — aus derselben Rechnung wie die Rücklagen-Deckung. */
  const [belegung, setBelegung] = useState<Belegungssicht | null>(null);
  /** Der Abgleich des Anfangsbestands — ein Eingriff, deshalb mit Vorschau. */
  const [fehler, setFehler] = useState<string | null>(null);

  /**
   * Setzt das aktive Konto und merkt es sich fuer den naechsten Besuch des Bereichs.
   *
   * Das Merken laeuft nebenher und ohne auf sein Ende zu warten: es entscheidet nichts,
   * und ein Klick, der auf einen Schreibvorgang wartet, faende sich langsam an. Geht es
   * schief, steht beim naechsten Mal das erste Konto da — dasselbe wie vorher.
   */
  function setAktivId(id: string) {
    setAktivIdRoh(id);
    if (id) void letztesKontoMerken(id).catch(() => {});
  }

  // EIN Ladevorgang, EIN setState. Gestaffelte await/setState-Paare lassen abgeleitete
  // Werte kurz gegen leere Listen rechnen — der Empfänger einer importierten Buchung
  // käme aus einer noch leeren Umsatz-Liste und die Zeile zeigte für einen Render
  // „Buchung" statt „Nordhoff".
  async function laden() {
    // Zusammen laden: die Vertragsliste steht in der Sammelbearbeitung neben den
    // Kategorien, und gestaffelt gesetzt waere ihr Auswahlfeld beim ersten Render leer.
    const [s, v, gemerkt, bel] = await Promise.all([
      kontenLaden(),
      vertragsliste(),
      letztesKonto(),
      // Ohne Belegung steht der Auszug trotzdem da — gemeldet wird es aber.
      kontobelegung(heute).catch((e) => { fehlerMelden(e); return null; }),
    ]);
    setSicht(s);
    setBelegung(bel);
    setVertraege([...v]);
    // Ein bereits gewaehltes Konto behaelt den Vorrang vor dem gemerkten: wer waehrend des
    // Ladens schon geklickt hat, soll nicht zurueckgesetzt werden. Und beide gelten nur,
    // solange es das Konto noch gibt — sonst das erste.
    setAktivIdRoh((id) => {
      const gibtEs = (x: string) => !!x && s.zeilen.some((z) => z.konto.id === x);
      return gibtEs(id) ? id : gibtEs(gemerkt) ? gemerkt : s.zeilen[0]?.konto.id ?? "";
    });
  }
  useEffect(() => {
    laden();
  }, []);


  const kontozeilen = sicht?.zeilen ?? [];
  const hatBindung = [...(belegung?.jeKonto.values() ?? [])].some((b) => b.gebunden > 0);
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
    () => (sicht && aktiv ? registerSicht(sicht, aktiv, heute) : null),
    [sicht, aktiv, heute],
  );

  const kategorieName = useMemo(() => new Map(kategorien.map((k) => [k.id, k.name])), [kategorien]);

  // Die Filter über das gebuchte Register: Suche, Art, Kategorie, nur Dubletten.
  const filter = useRegisterfilter({ register, kategorieName, geld, kontoId: aktivId });
  const { katFilter, setKatFilter, artFilter, setArtFilter, regSuche, setRegSuche, nurDubletten, setNurDubletten, kategorienImRegister, dublettenAnzahl } = filter;
  const gebuchtGefiltert = filter.gefiltert;

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

  // Standardansicht: neueste zuerst (Tabelle sortiert/paginiert intern weiter).
  const gebuchtFuerTabelle = useMemo(() => [...gebuchtGefiltert].reverse(), [gebuchtGefiltert]);

  // Markieren für die Sammelbearbeitung — über das GEFILTERTE Register (siehe
  // `useSammelauswahl`, auch zum Ausdünnen beim Filterwechsel).
  const alleIds = useMemo(
    () => gebuchtGefiltert.map((r) => r.zeile.istId).filter((x): x is string => !!x),
    [gebuchtGefiltert],
  );
  const sammel = useSammelauswahl(alleIds);

  // Die Auswahl gehört zum Register des Kontos — sie über einen Wechsel mitzunehmen
  // hiesse, Buchungen zu ändern, die man nicht mehr vor sich hat.
  useEffect(() => {
    sammel.leeren();
    // `sammel` ist je Render neu; gemeint ist nur der Kontowechsel.
  }, [aktivId]);

  /** Die markierten Zeilen als echte Buchungen — nur die, die es noch gibt. */
  const gewaehlteBuchungen = useMemo(() => ist.filter((b) => sammel.auswahl.has(b.id)), [ist, sammel.auswahl]);





  return (
    <div className="screen">
      {/* Ohne Untertitel, und das ist eine Entscheidung: „Kontostände, gebuchte und
          voraussichtliche Buchungen je Konto" sagte genau das, was man sieht. Was hier
          eine AUSSAGE trägt, steht an der Karte, wo es hingehört — „Anfangsbestand +
          bestätigte Ist-Buchungen = realer Stand". */}
      <PageHead title={t("konten.titel")} />

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
                //
                // Das Wort „Depot" stand bis 2026-09-22 hinter der Zahl und ist weg: die
                // Typ-Spalte derselben Zeile sagt es bereits. Ein Etikett, das in einer
                // Zeile zweimal steht, traegt beim zweiten Mal nichts mehr bei.
                sortValue: (z) => z.depot?.aktuell?.gesamtwert ?? z.realerStand,
                render: (z) =>
                  z.depot ? (
                    <span
                      style={{ fontWeight: "var(--fw-bold)" }}
                      title={t("depot.standErklaerung", { datum: z.depot.aktuell ? datum.mitJahr(z.depot.aktuell.stichtag) : "—" })}
                    >
                      {z.depot.aktuell ? geld.format(z.depot.aktuell.gesamtwert) : "—"}
                    </span>
                  ) : (
                    <span style={{ fontWeight: "var(--fw-bold)" }}>{geld.format(z.realerStand)}</span>
                  ),
              },
              // „frei" nur, wenn irgendein Konto überhaupt etwas gebunden hat — sonst stünde
              // dieselbe Zahl zweimal nebeneinander.
              ...(hatBindung
                ? [
                    {
                      key: "frei",
                      label: `${t("konten.spalteFrei")} ${geld.symbol}`,
                      align: "right" as const,
                      sortValue: (z: (typeof kontozeilen)[number]) => belegung?.jeKonto.get(z.konto.id)?.frei ?? z.realerStand,
                      render: (z: (typeof kontozeilen)[number]) => {
                        const b = belegung?.jeKonto.get(z.konto.id);
                        if (!b || b.gebunden === 0) return <span className="muted">—</span>;
                        return (
                          <span style={{ color: geldFarbe(b.frei) }} title={t("konten.spalteFreiHinweis")}>
                            {geld.format(b.frei)}
                          </span>
                        );
                      },
                    },
                  ]
                : []),
            ]}
            rows={[...kontozeilen]}
          />
        )}
      </Card>

      {aktiv && belegung?.jeKonto.get(aktiv.id) && (
        <BelegungKarte
          belegung={belegung.jeKonto.get(aktiv.id)!}
          namen={belegung.namen}
          konto={aktiv.bezeichnung}
        />
      )}


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
        // Kein eigener Rand oben: `.screen` setzt den Kartenabstand. Mit ihm standen über
        // dieser Karte 32 px und darunter 16 — am Bildschirmvergleich gefunden.
        <Card pad>
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
              <div className="hinweis" style={{ marginTop: 6 }}>
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
                    <Button variant="link" style={{ padding: 0 }} onClick={() => onNavigate("kontenverwaltung")}>
                      {t("konten.abgleichBereich.hinweg")}
                    </Button>
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

      {/* Das Gebuchte steht in einer EIGENEN Karte und nimmt die ganze Breite.

          Eine eigene Karte, weil es eine Sache für sich ist: sie liegt NEBEN der
          Kopf-Karte und nicht darin — keine Karte in einer Karte (siehe ui/CLAUDE.md),
          geprüft in `kartenschachtelung.test.tsx`.

          Die geplante Vorschau STAND daneben und steht jetzt in der Übersicht. Zwei
          Gründe, und der zweite wiegt schwerer: der Auszug beantwortet „was ist
          passiert", eine Liste über die Zukunft daneben beantwortet eine andere Frage im
          selben Bild. Und „was kommt noch auf mich zu" ist keine Frage EINES Kontos — wer
          vier führt, musste vier Auszüge öffnen und zusammenzählen. Dieselbe Trennung,
          die den Kontoabgleich schon aus der Kontenliste in einen eigenen Bereich
          geschoben hat. Der reale Stand von heute bleibt hier: er ist eine Auskunft ÜBER
          dieses Konto und steht oben in der Kopfzeile, wo er hingehört.

          Und die ganze Breite ist die Folge davon. Der goldene Schnitt zugunsten der
          Buchungen (1,618 : 1) teilte den Platz mit der Vorschau; ohne sie blieb ein
          Raster mit einer Spalte stehen, und die Tabelle mit ihren sieben Spalten und dem
          Seitenschalter endete bei knapp zwei Dritteln — Platz, den nichts mehr
          beanspruchte. Ein Raster überlebt die Karte nicht, die es begründet hat. */}
      {/* VORGEMERKT steht ÜBER dem Gebuchten, und die Reihenfolge ist die Aussage: was
          die Bank noch nicht gebucht hat, ist das Naechste, was passiert. Unter der
          Liste stuende es wie ein Nachtrag. */}
      {aktiv && sicht && !aktivZeile?.depot && (
        <VormerkungsBlock vormerkungen={sicht.vormerkungen.get(aktiv.id) ?? []} />
      )}

      {aktiv && register && !aktivZeile?.depot && (
        <Card title={t("konten.gebuchtTitel")}>
          {/* Filterleiste: Suche · Art (segmented) · Kategorie · Treffer */}
          <div className="tabellenfilter" style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-3)" }}>
            <span style={{ position: "relative", flex: "1 1 200px", minWidth: 160, display: "inline-flex", alignItems: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2.2" style={{ position: "absolute", left: 10, pointerEvents: "none" }}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
              <input className="field" style={{ width: "100%", paddingLeft: 30 }} value={regSuche} onChange={(e) => setRegSuche(e.target.value)} placeholder={t("konten.suche")} />
            </span>
            <Umschalter
              label={t("konten.artWahl")}
              optionen={ART_OPTS.map((opt) => ({ wert: opt.v, text: t(opt.k) }))}
              wert={artFilter}
              aufAendern={setArtFilter}
            />
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
            <span className="hinweis">{t("konten.buchungenAnzahl", { n: gebuchtGefiltert.length })}</span>
            {/* Erscheint nur, wenn es etwas zu sehen gibt. Ein Schalter, der dauerhaft
                „0 mögliche Dubletten" anbietet, ist eine Frage ohne Antwort. */}
            {dublettenAnzahl > 0 && (
              // Base UI `Toggle`: ein Schalter, der gedrückt bleibt — `aria-pressed` kommt von
              // dort, wie vorher von Hand.
              <Toggle
                pressed={nurDubletten}
                onPressedChange={setNurDubletten}
                style={{
                  padding: "5px 10px", fontSize: "var(--fs-ui)", fontFamily: "var(--font-ui)",
                  fontWeight: "var(--fw-bold)", borderRadius: "var(--r-md)", cursor: "pointer",
                  border: "1px solid var(--warn, var(--line))",
                  background: nurDubletten ? "var(--warn)" : "var(--warn-wash, transparent)",
                  color: nurDubletten ? "var(--auf-akzent)" : "var(--warn-deep, var(--ink-2))",
                  whiteSpace: "nowrap",
                }}
              >
                {t("konten.dubletten.filter", { n: dublettenAnzahl })}
              </Toggle>
            )}
            <Kaestchen
              an={sammel.modus}
              aufAendern={sammel.modusSetzen}
              style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)", whiteSpace: "nowrap" }}
            >
              {t("konten.sammel.modus")}
            </Kaestchen>
          </div>

          {/* Die Aktionsleiste erscheint erst, wenn etwas markiert ist — vorher gäbe es
              nichts zu tun, und ein grauer Knopf ist eine Frage ohne Antwort. */}
          {sammel.modus && sammel.auswahl.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-3)", padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--accent-wash)" }}>
              <span style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-bold)", color: "var(--accent-deep)" }}>
                {t("konten.sammel.gewaehlt", { n: sammel.auswahl.size })}
              </span>
              <Button variant="primary" onClick={() => setSammelOffen(true)}>{t("konten.sammel.bearbeiten")}</Button>
              <Button variant="link" onClick={sammel.leeren}>{t("konten.sammel.aufheben")}</Button>
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
                ...(sammel.modus
                  ? [{
                      key: "_sel",
                      label: (
                        <Kaestchen
                          an={sammel.alleGewaehlt}
                          label={t("konten.sammel.alleWaehlen")}
                          aufAendern={sammel.alleUmschalten}
                        />
                      ),
                      sortable: false,
                      render: (r: Registerzeile) =>
                        r.zeile.istId ? (
                          <Kaestchen
                            an={sammel.istGewaehlt(r.zeile.istId)}
                            label={t("konten.sammel.zeileWaehlen")}
                            aufAendern={() => sammel.umschalten(r.zeile.istId!)}
                          />
                        ) : null,
                    }]
                  : []),
                { key: "datum", label: t("konten.spalteDatum"), render: (r) => datum.mitJahr(r.zeile.datum) },
                {
                  // Nicht umbrechen (flexWrap): eine zweizeilige Zeile schiebt den
                  // Seitenschalter darunter je nach Seiteninhalt nach oben oder unten,
                  // und beim Durchblättern klickt man daneben. Der volle Text steht im
                  // title, für die Fälle, in denen abgeschnitten wird.
                  key: "bez", label: t("konten.spalteBeschreibung"), maxWidth: 320,
                  // Die Zeile öffnet die Buchung, und ihr Name zeigt das an — nicht das
                  // Datum davor (`bezeichner`, siehe `DataTable`).
                  bezeichner: true,
                  render: (r) => (
                    <span title={r.bezeichnung} style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "nowrap", maxWidth: "100%" }}>
                      <span className="zeilenname" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.bezeichnung}</span>
                      {r.zeile.gegenkontoId && <span className="hinweis" style={{ whiteSpace: "nowrap" }}>{r.zeile.betrag < 0 ? "→" : "←"} {kontoName.get(r.zeile.gegenkontoId) ?? "?"}</span>}
                      {/* Der Prüf-Marker steht VOR den anderen Pillen: die übrigen sagen,
                          was eine Zeile IST, dieser sagt, was noch zu tun ist. Klick nimmt
                          ihn weg — dafür ist er ein Knopf und kein Etikett.
                          Warnfarbe und Imperativ, weil er eine AUFFORDERUNG ist; grün und
                          „erledigt" lasen sich als Haken und damit als das Gegenteil. */}
                      {r.buchung?.zuPruefen && (
                        <BaseButton
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
                        </BaseButton>
                      )}
                      {!r.zeile.gegenkontoId && r.zeile.quelle === "manuell" && <Pill variant="neutral">{t("konten.pillManuell")}</Pill>}
                      {/* Gehört die Zeile zu einem Vertrag, steht der Anbieter dran.
                          Der NAME und nicht bloss „Vertrag": dass es einer ist, sieht man
                          an der Pille ohnehin — WELCHER, ist die Auskunft, für die man
                          vorher die Zeile öffnen musste. */}
                      {r.vertragsname && (
                        // Der title sitzt am Wrapper und nicht an der Pille — dieselbe
                        // Regel wie beim Dublettenverdacht darunter: `bausteine/` ist
                        // teils aus dem Design-System kopiert und kennt die Eigenschaft
                        // nicht, und dort wird nichts erfunden.
                        <span
                          title={t("konten.pillVertrag", { anbieter: r.vertragsname })}
                          style={{ flex: "0 0 auto", display: "inline-flex", maxWidth: 120, overflow: "hidden" }}
                        >
                          <Pill variant="plan" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {r.vertragsname}
                          </Pill>
                        </span>
                      )}
                      {/* Der Verdacht steht an BEIDEN Zeilen — es gibt kein Original.
                          Die Gründe hängen im title, entschieden wird im Detail. */}
                      {r.dublette && (
                        // Der title sitzt am Wrapper, nicht an der Pille: `bausteine/` ist teils aus
                        // dem Design-System kopiert und kennt die Eigenschaft nicht —
                        // dort wird nichts erfunden.
                        <BaseButton
                          type="button"
                          aria-label={t("konten.vergleich.oeffnen")}
                          style={{ flex: "0 0 auto", display: "inline-flex", background: "none", border: 0, padding: 0, cursor: "pointer" }}
                          title={[
                            r.dublette.gruende.join(" · "),
                            t("konten.dubletten.zwilling", { datum: r.dublette.zwillingDatum }),
                            // Nur wenn der Zwilling woanders liegt — sonst wäre es eine
                            // Zeile, die bei jeder Dublette dasselbe sagt.
                            ...(r.buchung && r.dublette.zwillingKontoId !== r.buchung.kontoId
                              ? [t("konten.dubletten.anderesKonto", { konto: kontoName.get(r.dublette.zwillingKontoId) ?? "?" })]
                              : []),
                            t("konten.vergleich.oeffnen"),
                          ].join(" · ")}
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
                        </BaseButton>
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
              // Die ganze Zeile öffnet die Buchung, wie in jeder anderen Tabelle. Bis
              // 2026-11-12 tat das nur der Stift am Ende — die Zeile sah klickbar aus und
              // war es nicht. Eine Zeile ohne Buchung (Rest aus einem Abruf) bleibt Text.
              onRowClick={(r) => r.buchung && setEditBuchung(r.buchung)}
              // Gebucht, aber der Buchungstag liegt noch vor uns: die Bank fuehrt die
              // Zeile bereits im Saldo, passiert ist sie noch nicht. Sie steht deshalb
              // hier oben und nicht unter „geplant" — gedaempft, damit man den
              // Unterschied sieht, statt sich spaeter ueber sie zu wundern.
              rowStyle={(r: Registerzeile) => (r.zeile.zukuenftig ? { opacity: 0.55 } : undefined)}
            />
          )}
        </Card>
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
          vertraege={vertraege}
          gesperrteIds={ausBankabruf}
          onClose={() => setSammelOffen(false)}
          onGeaendert={async () => { sammel.leeren(); await laden(); }}
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
