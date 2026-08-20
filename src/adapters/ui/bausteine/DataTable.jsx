import React from 'react';

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
 */

/** Kappungsbreite, wenn eine Spalte keine eigene angibt. Zahlen/Daten bleiben darunter. */
const STANDARD_MAX = '32ch';

export function DataTable({ columns, rows, onRowClick, istAktiv, sortable = false, pageSize,
  labelSeite, labelErste, labelLetzte, labelZurueck, labelVor }) {
  const [sort, setSort] = React.useState(null); // { idx, dir: 'asc' | 'desc' }
  const [page, setPage] = React.useState(0);

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

  return (
    <>
    <div style={{ overflowX:'auto', maxWidth:'100%' }}>
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
      <thead><tr>{columns.map(function(c,i){
        var sortbar = kannSortieren(c);
        var aktiv = sort && sort.idx === i;
        var pfeil = aktiv ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : (sortbar ? ' ⇅' : '');
        return <th key={i} onClick={sortbar?function(){toggleSort(i,c);}:undefined} style={{ textAlign:c.align==='right'?'right':'left', fontSize:'var(--fs-2xs)',
          fontWeight:'var(--fw-bold)', textTransform:'uppercase', letterSpacing:'.04em', color: aktiv ? 'var(--ink-2)' : 'var(--ink-3)',
          padding:'8px 10px', borderBottom:'1px solid var(--line)', cursor: sortbar?'pointer':'default', userSelect:'none', whiteSpace:'nowrap' }}>
          {c.label}<span style={{ opacity: aktiv?0.9:0.35 }}>{pfeil}</span></th>;
      })}</tr></thead>
      <tbody>{sichtbareRows.map(function(row,ri){
        var zeileAktiv = istAktiv ? istAktiv(row) : false;
        return <tr key={ri} onClick={onRowClick?function(){onRowClick(row);}:undefined}
          style={{ cursor:onRowClick?'pointer':'default', background:zeileAktiv?'var(--accent-soft, rgba(20,160,160,.10))':'transparent' }}>{columns.map(function(c,ci){
          var v=c.render?c.render(row):row[c.key];
          // Nur echter Text taugt als Tooltip; ein gerendertes Element hat keinen.
          var titel = (typeof v === 'string' || typeof v === 'number') ? String(v) : undefined;
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
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', marginTop:'10px', fontSize:'var(--fs-xs)', color:'var(--ink-3)' }}>
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
