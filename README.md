# psysonic-themes

Community theme registry for [Psysonic](https://github.com/Psychotoxical/psysonic).

A theme is a small set of colour tokens. Each theme lives in its own folder under
`themes/<id>/` and is delivered to the in-app Theme Store over a CDN.

## Anatomy of a theme

```
themes/<id>/
├── manifest.json   # id, name, author, version, description, mode, [tags], [minAppVersion]
├── theme.css       # a single [data-theme='<id>'] block of contract tokens
└── thumbnail.png   # store preview (recommended 720×450)
```

The `theme.css` may set **only** the colour tokens listed in
[`schema/allowed-tokens.json`](schema/allowed-tokens.json) (plus `color-scheme`),
on exactly one `[data-theme='<id>']` selector. No other selectors, no `@import`,
no external `url()`. This is what keeps every submission safe to auto-merge after a
quick visual check — the validator enforces it.

## Make a theme

1. Copy [`template/`](template/) to `themes/<your-id>/`.
2. Rename the `[data-theme='template']` selector and `manifest.id` to your id
   (must match the folder name, lowercase kebab-case).
3. Recolour the tokens. Set every core token; trim the optional block if unused.
4. Add a `thumbnail.png` (a screenshot of the theme, ≤300 KB). For a quick
   placeholder: `node scripts/make-thumbnail.mjs themes/<your-id>/thumbnail.png "#15171e"`.
5. Validate, then open a PR.

## Validate locally

```
npm install
node scripts/validate-theme.mjs themes/<your-id>   # one theme
node scripts/validate-theme.mjs                     # every theme in themes/
```

## Registry

`registry.json` is the single index the app reads (over a CDN). It is
**auto-generated** from the theme manifests — never hand-edit it. On every merge
to `main` a workflow regenerates it; locally you can run `npm run registry`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to submit a theme (naming,
description, and the PR checklist).

## License

Theme submissions are accepted under the [MIT License](LICENSE).
