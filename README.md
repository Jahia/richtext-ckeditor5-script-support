# richtext-ckeditor5-script-support

A Jahia `system` module that adds a `complete-with-scripts` CKEditor 5 config, enabling `<script>` tags in richtext fields. Useful for embedding third-party scripts — HubSpot forms, analytics snippets, tag managers, etc.

The feature is permission-gated: only users with the `allow-script-in-richtext` permission can insert scripts in the editor. Everyone else gets the standard `complete` config with script support disabled.

## The problem

`<script>` tags are stripped at two independent layers, both of which must be addressed:

| Layer | What strips it | Fix |
|---|---|---|
| CKEditor 5 (client) | [`DomConverter`](https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-engine/src/view/domconverter.ts) replaces `<script>` with a `<span data-ck-unsafe-element="script">` in the editing DOM; `domToView` does not expose inline script bodies as child nodes | Add `script` to `htmlSupport.allow` to activate the built-in [`ScriptElementSupport`](https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-html-support/src/integrations/script.ts) |
| Jahia `html-filtering` (server) | OWASP Java HTML Sanitizer strips `<script>` before the value is stored in JCR | Add `script` to the allowlist YAML |

## Installation

### 1. Deploy the module

```bash
mvn clean package
```

Go to **Jahia Administration → Modules & Extensions → Modules** and upload `target/richtext-ckeditor5-script-support-*.jar`.

This is a `system` module — active on all sites automatically, no per-site activation needed.

### 2. Allow `<script>` in html-filtering

`org.jahia.modules.htmlfiltering.global.custom.yml` does not exist by default and **fully replaces** the built-in default (no merge). Start from a copy:

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

> **Note:** this allowlist applies to all users regardless of permissions. It is a prerequisite for the feature to work at all, not a per-user security gate.

### 3. Activate the `complete-with-scripts` config

In `digital-factory-data/karaf/etc/org.jahia.modules.richtextCKEditor5.yaml`:

```yaml
configs:
  - name: complete-with-scripts
    permission: allow-script-in-richtext
  - name: complete
```

Jahia evaluates configs in order and picks the first one the current user is permitted to use. Users with `allow-script-in-richtext` get `complete-with-scripts`; everyone else gets `complete`.

The `permission` field is optional — omit it to give `complete-with-scripts` to all users. `siteKeys` can restrict activation to specific sites.

### 4. Grant the role to users or groups

This module ships the site role `allow-script-in-richtext` (`j:roleGroup=site-role`, scoped to `jnt:virtualsite`), with English and French translations — it appears as **"Allow to embed scripts in RichText"** in the Jahia admin. Assign it to the users or groups who should be allowed to embed scripts — they will automatically receive the `complete-with-scripts` config in the editor.

To grant the role site-wide in Jahia 8.2, go to **Administration → [your site] → Site roles** and assign `allow-script-in-richtext` to the user or group.

> The URL pattern is `http://<host>/jahia/administration/<siteKey>/settings/roles`.

## Dependencies

- `richtext-ckeditor5` — provides the `complete` config, which includes `GeneralHtmlSupport` and its built-in `ScriptElementSupport`
- `html-filtering` — must be configured as described in step 2

## Internals

See [INTERNALS.md](INTERNALS.md) for implementation details.
