# Definition Reduction Explorer

An interactive dictionary tree for drilling into the meaning of any concept — revealing the conceptual hierarchy beneath every word through recursive genus/differentia definition.

![Definition Reduction Explorer](screenshot.png)

## What it does

1. **Enter any concept** — fetches all senses from [Wiktionary](https://dictionaryapi.dev) (free, no key needed)
2. **Pick a sense** — every definition is shown with its parsed **Genus** and **Differentia**
3. **Branch** — key terms from your chosen sense become child nodes you can expand further
4. **Repeat infinitely** — builds a full conceptual hierarchy as deep as you want

### Optional: Perceptual Analysis (requires Anthropic API key)

Add your own `sk-ant-...` key in the UI to unlock for each chosen definition:

- **Concrete unit instances** — 3 specific real-world examples of the concept
- **Measurement omission** — what specific attributes are abstracted away when forming this concept
- **Perceptual grounding indicator** — whether the concept is directly perceivable or purely abstract
- **Grounding note** — how close or far the concept sits from direct sensory experience

The API key is entered in the browser and only ever sent directly to `api.anthropic.com` — it is never stored or transmitted elsewhere.

## Stack

- [React](https://react.dev) + [Vite](https://vitejs.dev)
- [Free Dictionary API](https://dictionaryapi.dev) — definitions (Wiktionary, no key needed)
- [Anthropic API](https://anthropic.com) — perceptual analysis (optional, bring your own key)

## Getting started

```bash
git clone https://github.com/fmue/definition-reduction-explorer
cd definition-reduction-explorer
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Deploy

**Netlify drop** (fastest):
```bash
npm run build
# drag the dist/ folder to netlify.com/drop
```

**Vercel:**
```bash
npx vercel
```

## How genus/differentia parsing works

Each dictionary definition is parsed using linguistic heuristics:

1. Strip leading adverbs and articles
2. Split on strong relational markers (*"that", "which", "characterized by"*, etc.)
3. Fall back to the first preposition after the head noun phrase
4. Comma/semicolon splits as last resort

Adverbs (ending in `-ly`) are converted to their root form — e.g. *"reciprocally"* → *"reciprocal"* — before being used as child nodes.

## License

MIT
