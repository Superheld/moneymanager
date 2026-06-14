Hairline table with tabular figures; first column bold. Use a custom `render` for amounts and pills.

```jsx
<DataTable
  columns={[{key:'nm',label:'Vertrag'}, {key:'amt',label:'Betrag',align:'right',
    render:r=> <span style={{color:r.um?'var(--accent-deep)':'var(--ink)'}}>{r.amt}</span>}]}
  rows={[{nm:'Miete',amt:'−1.250 €'},{nm:'ETF-Sparplan',amt:'−300 €',um:true}]} />
```

Color amounts by character: Ertrag green, Umschichtung teal, Aufwand ink. Minus sign is `−` (U+2212).
