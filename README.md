# richtext-ckeditor5-script-support

A Jahia `system` module that adds a `complete-with-scripts` CKEditor 5 config, enabling `<script>` tags in richtext fields. Useful for embedding third-party scripts — HubSpot forms, analytics snippets, tag managers, etc.

## The problem

`<script>` tags are stripped at two independent layers, both of which must be fixed:

| Layer | What strips it | Fix |
|---|---|---|
| CKEditor 5 | `DomConverter` replaces `<script>` with a `<span>` in the editing DOM; `domToView` does not expose inline script bodies as view children | Add `script` to `htmlSupport.allow` to activate the built-in `ScriptElementSupport` |
| Jahia `html-filtering` | OWASP Java HTML Sanitizer strips `<script>` before the value is stored in JCR | Add `script` to the allowlist YAML |

## Installation

### 1. Deploy the module

```bash
mvn clean package
```

Go to **Jahia Administration → Modules & Extensions → Modules** and upload `target/richtext-ckeditor5-script-support-*.jar`.

This is a `system` module — it is active on all sites automatically, no per-site activation needed.

### 2. Allow `<script>` in html-filtering

`org.jahia.modules.htmlfiltering.global.custom.yml` does not exist by default and **fully replaces** the built-in default (no merge). Start from a copy of the default:

```bash
cp digital-factory-data/karaf/etc/org.jahia.modules.htmlfiltering.global.default.yml \
   digital-factory-data/karaf/etc/org.jahia.modules.htmlfiltering.global.custom.yml
```

In the copy, add the following entries in **both** `editWorkspace` and `liveWorkspace`, inside `allowedRuleSet.elements`, immediately before the `protocols` key:

```yaml
      - tags:
        - "script"
      - format: "LINKS_URL"
        attributes:
        - "src"
        tags:
        - "script"
      - attributes:
        - "type"
        - "async"
        - "defer"
        - "charset"
        - "crossorigin"
        - "integrity"
        - "referrerpolicy"
        - "nomodule"
        tags:
        - "script"
      protocols:   # <-- already present, insert above this line
```

Felix FileInstall picks up the change automatically — no restart needed.

### 3. Activate the `complete-with-scripts` config

In `digital-factory-data/karaf/etc/org.jahia.modules.richtextCKEditor5.yaml`:

```yaml
configs:
  - name: complete-with-scripts
    permission: richtext-embed-scripts
  - name: complete
```

Jahia evaluates configs in order and picks the first one the current user is permitted to use. Users with the `richtext-embed-scripts` permission get `complete-with-scripts`; everyone else gets `complete`.

The `permission` field is optional — omit it to give `complete-with-scripts` to all users. Use `siteKeys` to restrict activation to specific sites.

### 4. Grant the permission

The `richtext-embed-scripts` permission is registered by this module (see `src/main/import/permissions.xml`). It sits under the `wysiwyg-editor-toolbar` group alongside the standard `view-full-wysiwyg-editor`, `view-basic-wysiwyg-editor`, and `view-light-wysiwyg-editor` permissions.

Assign it to the appropriate role in **Jahia Administration → Users and Roles**.

## How it works

### Permission enforcement

The `complete` config ships with `htmlSupport.allow: [{ name: /.*/ }]`, a wildcard that inadvertently activates `ScriptElementSupport` for all users. Without a countermeasure, the permission gate in the YAML would have no effect client-side.

When this module loads, it patches the `complete` config in the Jahia registry to add `htmlSupport.disallow: [{ name: 'script' }]`. In GHS, `disallow` takes precedence over `allow`, so script support is suppressed for all users of `complete`. The `complete-with-scripts` config is built from the original `complete` (before the patch) and explicitly re-allows `<script>`.

Note: this is a client-side gate only. The `html-filtering` YAML (step 2) must still be configured — it is the server-side gate that prevents scripts from being stored in JCR regardless of how the richtext field was edited.

### Client-side — CKEditor 5

CKEditor 5 blocks `<script>` at two levels inside `DomConverter`:

1. **Editing DOM** — script elements are replaced by `<span data-ck-unsafe-element="script">` to prevent accidental execution while editing.
2. **Data loading** — `domToView` does not expose the text content of `<script>` elements as child nodes, so the inline body is invisible to the standard upcast API.

Both are handled by `ScriptElementSupport`, a plugin that ships inside `GeneralHtmlSupport` (which is already part of the `complete` config). Adding `{ name: 'script' }` to `htmlSupport.allow` activates it:

- `registerRawContentMatcher({ name: 'script' })` instructs `DomConverter` to store the raw script body as a `$rawContent` custom property on the view element, rather than attempting to process it as child nodes.
- The **upcast** reads `$rawContent` and stores it in the `htmlScript` model element's `htmlContent` attribute.
- The **data downcast** restores the original `<script>` tag and its body via `createRawElement`, which bypasses `DomConverter`'s security check and outputs the tag unmodified.

### Server-side — Jahia html-filtering

The `html-filtering` module runs OWASP Java HTML Sanitizer as a JCR interceptor: every richtext property is sanitized before being stored. Since `<script>` is not in the default allowlist, it is stripped on save regardless of what CKEditor outputs. It must be explicitly added to the custom YAML as described above.

### Why a separate module?

Script support could have been added directly to `richtext-ckeditor5`. A separate module was chosen to keep the core untouched, make the feature opt-in, and avoid complicating future upgrades.

## Dependencies

- `richtext-ckeditor5` — provides the `complete` config, which includes `GeneralHtmlSupport` and its built-in `ScriptElementSupport`
- `html-filtering` — must be configured as described in step 2
