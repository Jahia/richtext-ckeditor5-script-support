# RichText CKEditor5 Script Support

A Jahia `system` module that enables `<script>` tags in CKEditor 5 richtext fields. Useful for embedding third-party scripts (HubSpot forms, analytics snippets, etc.) directly in richtext content.

## Overview

By default, `<script>` tags are stripped at two independent layers:

| Layer | Problem | Fix |
|---|---|---|
| CKEditor 5 (client-side) | `DomConverter` blocks `<script>` in the editing DOM; `domToView` does not expose inline script bodies as view children | `ScriptElement` plugin with a data processor wrapper |
| Jahia `html-filtering` (server-side) | OWASP sanitizer strips `<script>` on save | Add `script` to the allowlist YAML |

Both layers must be configured for scripts to survive end-to-end.

## Installation

### 1. Deploy the module

```bash
mvn clean package
```

In Jahia, go to **Administration → Server → Modules & Extensions → Modules**, then upload `target/richtext-ckeditor5-script-support-*.jar`.

Since this is a `system` module, it is active on all sites automatically — no per-site activation needed.

### 2. Configure html-filtering

`org.jahia.modules.htmlfiltering.global.custom.yml` does not exist by default and **fully replaces** the default (no merge). Start by copying the default:

```bash
cp digital-factory-data/karaf/etc/org.jahia.modules.htmlfiltering.global.default.yml \
   digital-factory-data/karaf/etc/org.jahia.modules.htmlfiltering.global.custom.yml
```

In the copy, add the following entries in **both** `editWorkspace` and `liveWorkspace`, inside `allowedRuleSet.elements`, just before the `protocols` key:

```yaml
      # Allows the <script> tag and its inline text content
      - tags:
        - "script"
      # Allows the src attribute, validated against the LINKS_URL pattern
      - format: "LINKS_URL"
        attributes:
        - "src"
        tags:
        - "script"
      # Allows standard <script> attributes
      - attributes:
        - "type"         # e.g. text/javascript
        - "async"        # asynchronous loading
        - "defer"        # deferred execution
        - "charset"      # e.g. utf-8 (used by HubSpot)
        - "crossorigin"  # CORS
        - "integrity"    # SRI hash
        - "referrerpolicy"
        - "nomodule"     # fallback for browsers without ESM support
        tags:
        - "script"
      protocols:   # <-- already present, insert above this line
```

Felix FileInstall picks up the change automatically — no restart needed.

### 3. Activate the CKEditor config

In `digital-factory-data/karaf/etc/org.jahia.modules.richtextCKEditor5.yaml`:

```yaml
configs:
  - name: completeWithScripts
```

Use `includeSites` / `excludeSites` to scope activation to specific sites.

## How it works

The problem comes from two independent places. Even if you get past the CKEditor layer, the script is stripped on save by the server. Both must be addressed.

### Client-side

CKEditor 5 blocks `<script>` at two levels:

1. `DomConverter` refuses to render script elements in the live editing DOM.
2. More subtly, `domToView` (used when loading data into the editor) does not expose the text content of `<script>` elements as child nodes in the view. The standard upcast API sees an empty element regardless of the script body — so even with `htmlSupport.allow` configured, the inline content is silently lost.

To work around this, the `ScriptElement` plugin wraps the data processor's `toView` method. Before CKEditor parses the HTML, any inline script body is base64-encoded into a temporary `data-cks-body` attribute, turning content CKEditor cannot see into an attribute it can carry through its pipeline.

The plugin then defines:

- **Upcast**: reads and decodes `data-cks-body`, stores the result in the `scriptPreserved` model element's `scriptContent` attribute. The model element is named `scriptPreserved` (not `htmlScript`) to avoid collision with `GeneralHtmlSupport`, which auto-generates model names as `html` + PascalCase.
- **Editing downcast**: renders a styled placeholder `<div>` with a purple background — a real `<script>` is never put into the editing DOM.
- **Data downcast**: restores the original `<script>` tag and its body using `createRawElement`, which is processed before DomConverter's security check and therefore goes through unblocked.

### Server-side

The `html-filtering` module runs OWASP Java HTML Sanitizer as a JCR interceptor: every richtext property is sanitized before being stored. Since `<script>` is not in the default allowlist, it is stripped on save even if CKEditor outputs it correctly. It must be added explicitly to the custom configuration as described in the installation steps.

### Why a separate module?

This behaviour could also have been implemented by modifying `richtext-ckeditor5` directly. A separate module was chosen to keep the core untouched and avoid complicating future upgrades.

## Dependencies

- `richtext-ckeditor5` — provides the base `complete` CKEditor config that `completeWithScripts` extends
- `html-filtering` — must be configured as described in step 2
