import React from 'react';
import { useSchmal } from './useSchmal';

/**
 * DataTable — the hairline table used across Verträge, Liquidität, Analysen, Stammdaten.
 * `columns` define key, label, align ('left'|'right'), and an optional cell renderer.
 * Right-aligned numeric columns get tabular figures automatically.
 *
 * Sortierung (opt-in via `sortable`): Klick auf einen Spaltenkopf sortiert auf → ab →
 * Originalreihenfolge. Sortierwert ist `column.sortValue(row)` oder sonst `row[column.key]`
 * (Zahlen numerisch, sonst locale-/numerisch-tolerant). Einzelne Spalten lassen sich mit
 * `column.sortable === false` ausnehmen.
 *
 * Zeilenhöhe: Zellen brechen NICHT um. Eine zweizeilige Zeile verschiebt alles darunter —
 * bei paginierten Tabellen wandert dadurch der Seitenschalter je nach Inhalt der aktuellen
 * Seite nach oben oder unten, und man klickt daneben.
 *
 * Breite: Nicht-Umbrechen allein sprengt die Tabelle, sobald ein Wert lang ist (ein
 * Anbietername wie „SWB - Service-, Wohnungsvermietungs- und Verwaltungsgesellschaft mbH"
 * schiebt sie über den Bildschirmrand). Deshalb sitzt der Inhalt jeder Zelle in einem
 * Block mit `max-width` und wird dort abgeschnitten; der volle Text steht im `title`.
 *
 * WARUM ein innerer Block und nicht `max-width` an der Zelle selbst: die Wirkung von
 * min-/max-width auf Tabellenzellen ist in CSS 2.1 ausdrücklich UNDEFINIERT und wird bei
 * `table-layout: auto` von Browsern ignoriert. Genau das war der Fehler — `column.maxWidth`
 * stand an den Konten-Spalten und tat nichts. In einem gewöhnlichen Block gilt max-width
 * dagegen sicher, und die begrenzte Breite geht in die Spaltenberechnung ein.
 *
 * Als Fangnetz liegt die Tabelle in einem waagerecht scrollbaren Rahmen: passt sie in einem
 * schmalen Fenster trotzdem nicht, scrollt SIE — statt die ganze Seite breitzuziehen.
 *
 * ## Schmal: dieselbe Tabelle mit zwei Spalten
 *
 * Auf einem Telefon war der Rahmen bisher die ganze Antwort — man sah die ersten Spalten
 * und musste seitwärts schieben, um an den Betrag zu kommen, also an das, wofür man
 * hingesehen hat. Unter 700 px (`useSchmal`) fällt die Tabelle deshalb auf ZWEI Spalten
 * zusammen: links der Bezeichner, darunter gedämpft die verschobenen Werte, rechts die
 * eine Zahl.
 *
 * **Es bleibt eine Tabelle, keine Kartenliste.** Die Zahl steht in jeder Zeile an
 * derselben Stelle, und damit bleibt das Einzige erhalten, wofür eine Tabelle da ist: man
 * liest eine Spalte hinunter, ohne sie zu suchen. Aus demselben Grund bleiben die beiden
 * Spaltenköpfe stehen — mit ihnen bliebe sonst auch die Sortierung.
 *
 * **Die Vorgabe verschiebt, sie streicht nicht.** Ohne Angabe wird die erste Spalte zum
 * Titel, die erste rechtsbündige zum Wert, und ALLES ÜBRIGE wandert in die zweite Zeile.
 * Das ist unaufgeräumt und mit Absicht: eine Spalte still fallen zu lassen, wäre in einer
 * Finanz-App eine gekürzte Auskunft, die niemand entschieden hat. Weggeräumt wird je
 * Tabelle von Hand, über `column.schmal` — ist das an EINER Spalte gesetzt, gilt nur noch,
 * was ausdrücklich dasteht, und der Rest fällt weg.
 */

/** Kappungsbreite, wenn eine Spalte keine eigene angibt. Zahlen/Daten bleiben darunter. */
const STANDARD_MAX = '32ch';

/**
 * Breite der Wertspalte in der schmalen Form.
 *
 * Sie muss FEST sein: schmal liegt `table-layout: fixed` an, sonst zieht ein langer Name
 * die Tabelle wieder aus dem Bild — genau das Übel, gegen das die schmale Form gebaut ist.
 * 12ch fasst einen Betrag samt Minus, Tausenderpunkt und Währungszeichen.
 */
const SCHMAL_WERT_BREITE = '12ch';

/**
 * Welche Spalten schmal überleben, und in welcher Rolle — samt ihrem ursprünglichen
 * Index, damit die Sortierung weiter auf dieselbe Spalte zeigt.
 */
function schmalRollen(columns) {
  var mitIndex = columns.map(function (c, i) { return { c: c, i: i }; });
  var gewaehlt = mitIndex.some(function (e) { return !!e.c.schmal; });

  if (gewaehlt) {
    return {
      titel: mitIndex.find(function (e) { return e.c.schmal === 'titel'; }) || mitIndex[0],
      wert: mitIndex.find(function (e) { return e.c.schmal === 'wert'; }) || null,
      zweit: mitIndex.filter(function (e) { return e.c.schmal === 'zweitzeile'; }),
    };
  }

  var titel = mitIndex[0];
  var wert = null;
  for (var k = 1; k < mitIndex.length; k++) {
    if (mitIndex[k].c.align === 'right') { wert = mitIndex[k]; break; }
  }
  return {
    titel: titel,
    wert: wert,
    zweit: mitIndex.filter(function (e) { return e !== titel && e !== wert; }),
  };
}

/** Der Zellwert einer Spalte — über `render`, sonst roh aus der Zeile. */
function zellwert(c, row) {
  return c.render ? c.render(row) : row[c.key];
}

/** Nur echter Text taugt als Tooltip; ein gerendertes Element hat keinen. */
function alsText(v) {
  return (typeof v === 'string' || typeof v === 'number') ? String(v) : undefined;
}

export function DataTable({ columns, rows, onRowClick, istAktiv, rowStyle, sortable = false, pageSize,
  labelSeite, labelErste, labelLetzte, labelZurueck, labelVor }) {
  const [sort, setSort] = React.useState(null); // { idx, dir: 'asc' | 'desc' }
  const [page, setPage] = React.useState(0);
  const schmal = useSchmal();

  function kannSortieren(c) {
    return sortable && c.sortable !== false;
  }
  function toggleSort(ci, c) {
    if (!kannSortieren(c)) return;
    setPage(0);
    setSort(function (prev) {
      if (!prev || prev.idx !== ci) return { idx: ci, dir: 'asc' };
      if (prev.dir === 'asc') return { idx: ci, dir: 'desc' };
      return null; // dritter Klick: zurück zur Originalreihenfolge
    });
  }

  var sortedRows = rows;
  if (sort) {
    var sc = columns[sort.idx];
    var wert = sc.sortValue || function (r) { return r[sc.key]; };
    sortedRows = rows.slice().sort(function (a, b) {
      var va = wert(a), vb = wert(b);
      var cmp;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb), undefined, { numeric: true, sensitivity: 'base' });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }

  var gesamt = sortedRows.length;
  var seiten = pageSize ? Math.max(1, Math.ceil(gesamt / pageSize)) : 1;
  var seite = Math.min(page, seiten - 1);
  var sichtbareRows = pageSize ? sortedRows.slice(seite * pageSize, (seite + 1) * pageSize) : sortedRows;

  var btn = { border:'1px solid var(--line)', background:'var(--surface)', borderRadius:'var(--r-md)', padding:'4px 10px', cursor:'pointer', fontSize:'13px', color:'var(--ink-2)' };

  var rollen = schmal ? schmalRollen(columns) : null;
  // Die Kopfzeile zeigt schmal genau die beiden Spalten, die es noch gibt — mit ihrem
  // ursprünglichen Index, damit ein Klick weiterhin nach derselben Spalte sortiert.
  var kopf = schmal
    ? [rollen.titel, rollen.wert].filter(Boolean)
    : columns.map(function (c, i) { return { c: c, i: i }; });

  function zelleZweitzeile(row) {
    var teile = [];
    var texte = [];
    rollen.zweit.forEach(function (e, n) {
      var v = zellwert(e.c, row);
      if (v === null || v === undefined || v === '') return;
      if (teile.length) teile.push(<span key={'t' + n} style={{ opacity: .45 }}> · </span>);
      teile.push(<React.Fragment key={'v' + n}>{v}</React.Fragment>);
      var s = alsText(v);
      if (s) texte.push(s);
    });
    if (!teile.length) return null;
    return (
      <div title={texte.length ? texte.join(' · ') : undefined}
        style={{ marginTop:2, fontSize:'12px', fontWeight:'var(--fw-regular)', color:'var(--ink-3)',
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{teile}</div>
    );
  }

  return (
    <>
    <div style={{ overflowX:'auto', maxWidth:'100%' }}>
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px',
      tableLayout: schmal ? 'fixed' : 'auto' }}>
      <thead><tr>{kopf.map(function(e){
        var c = e.c, i = e.i;
        var sortbar = kannSortieren(c);
        var aktiv = sort && sort.idx === i;
        var pfeil = aktiv ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : (sortbar ? ' ⇅' : '');
        var rechts = c.align === 'right';
        return <th key={i} onClick={sortbar?function(){toggleSort(i,c);}:undefined}
          style={{ textAlign:rechts?'right':'left', fontSize:'var(--fs-2xs)',
          fontWeight:'var(--fw-bold)', textTransform:'uppercase', letterSpacing:'.04em', color: aktiv ? 'var(--ink-2)' : 'var(--ink-3)',
          padding:'8px 10px', borderBottom:'1px solid var(--line)', cursor: sortbar?'pointer':'default', userSelect:'none', whiteSpace:'nowrap',
          width: schmal && rechts ? SCHMAL_WERT_BREITE : undefined,
          overflow: schmal ? 'hidden' : undefined, textOverflow: schmal ? 'ellipsis' : undefined }}>
          {c.label}<span style={{ opacity: aktiv?0.9:0.35 }}>{pfeil}</span></th>;
      })}</tr></thead>
      <tbody>{sichtbareRows.map(function(row,ri){
        var zeileAktiv = istAktiv ? istAktiv(row) : false;
        // `rowStyle` liegt ZULETZT drauf, damit eine Zeile sich auch gegen die Vorgaben
        // stellen kann. Gedacht ist es fuer `opacity`: das daempft den ganzen Teilbaum
        // auf einmal, auch die Zellen, die ihre Farbe selbst setzen (Betraege). Ueber
        // `color` ginge das nicht — die Zellen ueberschreiben es.
        var eigen = rowStyle ? rowStyle(row) : null;
        var zeilenStil = Object.assign({ cursor:onRowClick?'pointer':'default', background:zeileAktiv?'var(--accent-soft, rgba(20,160,160,.10))':'transparent' }, eigen);
        var klick = onRowClick?function(){onRowClick(row);}:undefined;

        if (schmal) {
          var tv = zellwert(rollen.titel.c, row);
          var wv = rollen.wert ? zellwert(rollen.wert.c, row) : null;
          return <tr key={ri} onClick={klick} style={zeilenStil}>
            <td style={{ padding:'10px', borderBottom:'1px solid var(--line-soft)', textAlign:'left',
              color:'var(--ink)', overflow:'hidden' }}>
              <div title={alsText(tv)} style={{ fontWeight:'var(--fw-bold)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tv}</div>
              {zelleZweitzeile(row)}
            </td>
            {rollen.wert && <td style={{ padding:'10px', borderBottom:'1px solid var(--line-soft)', textAlign:'right',
              fontVariantNumeric:'tabular-nums', color:'var(--ink)', overflow:'hidden',
              textOverflow:'ellipsis', whiteSpace:'nowrap', verticalAlign:'top' }}>{wv}</td>}
          </tr>;
        }

        return <tr key={ri} onClick={klick} style={zeilenStil}>{columns.map(function(c,ci){
          var v=zellwert(c,row);
          var titel = alsText(v);
          return <td key={ci} style={{ padding:'10px', borderBottom:'1px solid var(--line-soft)',
            textAlign:c.align==='right'?'right':'left', fontVariantNumeric:c.align==='right'?'tabular-nums':'normal',
            fontWeight:ci===0?'var(--fw-bold)':'var(--fw-regular)', color:'var(--ink)',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {/* marginLeft:auto hält rechtsbündige Spalten am rechten Zellenrand: die
                Tabelle verteilt übrige Breite auf die Spalten, und ein gekappter Block
                stünde sonst links davon — Zahl und Spaltenkopf lägen nicht übereinander. */}
            <div title={titel} style={{ maxWidth:c.maxWidth || STANDARD_MAX,
              marginLeft:c.align==='right'?'auto':undefined,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v}</div></td>;
        })}</tr>;
      })}</tbody>
    </table>
    </div>
    {pageSize && seiten > 1 && (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', marginTop:'10px', fontSize:'var(--fs-xs)', color:'var(--ink-3)', flexWrap:'wrap' }}>
        <button style={{ ...btn, opacity: seite===0?0.4:1 }} disabled={seite===0} onClick={function(){ setPage(0); }} title={labelErste}>|‹</button>
        <button style={{ ...btn, opacity: seite===0?0.4:1 }} disabled={seite===0} onClick={function(){ setPage(seite-1); }} title={labelZurueck}>‹</button>
        {/* Freie Seitenwahl: bei tausenden Zeilen ist „ans Ende blättern" sonst Klickarbeit. */}
        <input type="number" min="1" max={seiten} value={seite+1} aria-label={labelSeite}
          onChange={function(e){
            var n = parseInt(e.target.value, 10);
            if (!isNaN(n)) setPage(Math.min(Math.max(n,1), seiten) - 1);
          }}
          style={{ width:'5.5ch', padding:'2px 4px', textAlign:'center', fontSize:'var(--fs-xs)',
            border:'1px solid var(--line)', borderRadius:'var(--r-sm, 4px)', background:'var(--surface)',
            color:'var(--ink-2)', fontFamily:'inherit' }} />
        <span style={{ whiteSpace:'nowrap' }}>/ {seiten} · {(seite*pageSize)+1}–{Math.min(gesamt,(seite+1)*pageSize)} / {gesamt}</span>
        <button style={{ ...btn, opacity: seite>=seiten-1?0.4:1 }} disabled={seite>=seiten-1} onClick={function(){ setPage(seite+1); }} title={labelVor}>›</button>
        <button style={{ ...btn, opacity: seite>=seiten-1?0.4:1 }} disabled={seite>=seiten-1} onClick={function(){ setPage(seiten-1); }} title={labelLetzte}>›|</button>
      </div>
    )}
    </>
  );
}
