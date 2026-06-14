Small rounded tag that carries Glossar semantics — use it to mark a payment's character, Plan vs. Ist, or a coverage status.

```jsx
<Pill variant="um">Umschichtung</Pill>
<Pill variant="ertrag">Einnahme</Pill>
<Pill variant="plan">Plan</Pill>
```

Variants: `neutral` (default), `plan` (dashed teal — projected), `ist` (ink — booked fact), `um` (teal — Sparen/Anlegen, kein Verbrauch), `ertrag` (green), `aufwand` (muted), `warn` (amber), `ok` (green wash). Keep labels short; never use for long text.
