Centered modal for the create flows. Compose FormField / RadioCard / LiveResult inside; pass buttons as `footer`.

```jsx
<Dialog title="Topf anlegen" subtitle="reservier Geld für später"
  onClose={close}
  footer={<><Button>Abbrechen</Button><span style={{flex:1}}/><Button variant="primary">Topf anlegen</Button></>}>
  <FormField label="Gegenstand" required>…</FormField>
  <LiveResult label="Ansparrate (berechnet)" value="+150 €" sub="14.400 € ÷ 8 J. ÷ 12" />
</Dialog>
```
