import React from 'react';

var MON=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
function fmt(n){return Math.round(n).toLocaleString('de-DE');}

/**
 * LiquidityChart — the signature year-curve. Ist = solid ink line up to `istThrough`,
 * Plan = dashed teal line for the full year, with a soft fill, a "heute" marker and an
 * optional dip (Engpass) callout. Pass monthly balances in `plan` (12 values).
 */
export function LiquidityChart({ plan, istThrough = 5, max = 5700, dip = 6, width = 1040, height = 288, showDip = true }) {
  var padL=52,padR=22,padT=22,padB=34;
  var ist=plan.slice(0,istThrough+1).map(function(v,i){return v+(i%2?-260:180);});
  var ix=function(i){return padL+i*(width-padL-padR)/11;};
  var iy=function(v){return padT+(max-v)*(height-padT-padB)/max;};
  var line=function(a){return a.map(function(v,i){return (i?'L':'M')+ix(i).toFixed(1)+' '+iy(v).toFixed(1);}).join(' ');};
  var grid=[];for(var g=0;g<=3;g++){var vv=max*g/3;grid.push({y:iy(vv),lbl:(Math.round(vv/100)/10)+'k'});}
  return (
    <svg viewBox={'0 0 '+width+' '+height} width="100%" style={{display:'block',height:'auto'}}>
      <defs><linearGradient id="mm-pg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--accent)" stopOpacity="0.16"/><stop offset="1" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs>
      {grid.map(function(gg,i){return <g key={i}>
        <line x1={padL} y1={gg.y} x2={width-padR} y2={gg.y} stroke="var(--line)" strokeWidth="1"/>
        <text x={padL-9} y={gg.y+4} textAnchor="end" fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-ui)">{gg.lbl}</text></g>;})}
      {MON.map(function(m,i){return <text key={i} x={ix(i)} y={height-11} textAnchor="middle" fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-ui)">{m}</text>;})}
      <path d={line(plan)+' L'+ix(11)+' '+iy(0)+' L'+ix(0)+' '+iy(0)+' Z'} fill="url(#mm-pg)"/>
      <path d={line(plan)} fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeDasharray="7 6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d={line(ist)} fill="none" stroke="var(--ink)" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={ix(istThrough)} cy={iy(ist[istThrough])} r="4.3" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2.6"/>
      {showDip && <g>
        <circle cx={ix(dip)} cy={iy(plan[dip])} r="5.5" fill="var(--warn)" stroke="var(--surface)" strokeWidth="2"/>
        <text x={ix(dip)} y={iy(plan[dip])+23} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--warn-deep)" fontFamily="var(--font-ui)">{'Tiefpunkt '+fmt(plan[dip])+' €'}</text></g>}
      <line x1={ix(istThrough)} y1={padT} x2={ix(istThrough)} y2={height-padB} stroke="var(--warn)" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6"/>
      <text x={ix(istThrough)+6} y={padT+2} fontSize="11.5" fontWeight="700" fill="var(--warn-deep)" fontFamily="var(--font-ui)">heute</text>
    </svg>
  );
}
