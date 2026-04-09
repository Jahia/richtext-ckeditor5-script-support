# How it works

## Permission enforcement (client-side)

The `complete` config ships with `htmlSupport.allow: [{ name: /.*/ }]`, a wildcard that inadvertently activates `ScriptElementSupport` for all users (see [GHS documentation](https://ckeditor.com/docs/ckeditor5/latest/features/html/general-html-support.html) — `disallow` takes precedence over `allow`). Without a countermeasure, the YAML permission gate would have no real effect.

When this module loads it does two things:

1. **Patches `complete`** — adds `htmlSupport.disallow: [{ name: 'script' }]` to the existing registry entry, suppressing script support for all users of `complete`.
2. **Creates `complete-with-scripts`** — built from the original `complete` (before the patch) with `{ name: 'script', attributes: true }` added to `htmlSupport.allow`. Script support is active only for this config.

The YAML then selects the appropriate config per user based on the permission. The gate is **client-side only** — `html-filtering` applies to all users equally and is required for scripts to survive save regardless of which config was used.

## CKEditor 5 internals

`DomConverter` blocks `<script>` at two levels (see [`domconverter.ts`](https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-engine/src/view/domconverter.ts)):

- **Editing DOM** — `unsafeElements = ['script', 'style']` causes script elements to be replaced by `<span data-ck-unsafe-element="script">` to prevent execution while editing.
- **Data loading** — `domToView` does not expose the text content of `<script>` elements as child nodes, so the inline body is invisible to the standard upcast API.

Both are solved by [`ScriptElementSupport`](https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-html-support/src/integrations/script.ts), a plugin inside `GeneralHtmlSupport` activated by adding `script` to `htmlSupport.allow`:

- **[`registerRawContentMatcher({ name: 'script' })`](https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-engine/src/view/domconverter.ts#L1295)** — instructs `DomConverter` to store the raw script body as a `$rawContent` custom property on the view element instead of trying to process it as child nodes (which yields nothing).
- **Upcast** — reads `$rawContent` and stores it in the `htmlScript` model element's `htmlContent` attribute.
- **Data downcast** — restores the original `<script>` tag and body via `createRawElement`, a special view element whose content is serialized as raw HTML, short-circuiting the standard view-to-DOM conversion pipeline.

## Server-side — Jahia html-filtering

The `html-filtering` module runs OWASP Java HTML Sanitizer as a JCR interceptor. Every richtext property is sanitized before being stored. Since `<script>` is not in the default allowlist it is stripped on save even if CKEditor outputs it correctly. The custom YAML (step 2 of the README) adds it explicitly.

## Why a separate module?

Script support could have been added directly to `richtext-ckeditor5`. A separate module keeps the core untouched, makes the feature opt-in per environment, and avoids complicating future upgrades.
