# richtext-ckeditor5-script-support

A Jahia `system` module that adds a `complete-with-scripts` CKEditor 5 config, enabling `<script>` tags in richtext fields. Useful for embedding third-party scripts — HubSpot forms, analytics snippets, tag managers, etc.

The feature is permission-gated: only users with the `allow-script-in-richtext` permission can insert scripts in the editor. Everyone else gets the standard `complete` config with script support disabled.

## The problem

`<script>` tags are stripped at two independent layers, both of which must be addressed:

| Layer | What strips it | Fix |
|---|---|---|
| CKEditor 5 (client) | `DomConverter` replaces `<script>` with a `<span>` in the editing DOM; `domToView` does not expose inline script bodies as child nodes | Add `script` to `htmlSupport.allow` to activate the built-in `ScriptElementSupport` |
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

### 4. Create a role and grant the permission

The `allow-script-in-richtext` permission is defined by this module in `src/main/import/permissions.xml`. After deployment it is available in JCR under:

```
/modules/richtext-ckeditor5-script-support/<version>/permissions/unsecure-permissions/allow-script-in-richtext
```

It is grouped under **Unsecure permissions** because embedding executable scripts in live content is a sensitive capability that should be granted deliberately.

This module ships a ready-to-use edit role `allow-script-in-richtext` (defined in `src/main/import/roles.xml`). It contains only the `allow-script-in-richtext` permission and is standalone — assign it on top of a user's existing editor role.

To grant it site-wide:

1. In **jContent**, open the site root node
2. Open the node engine and go to the **Edit roles** tab
3. Click **+**, select the user or group, and assign `allow-script-in-richtext`
4. Save — the role is inherited by all sub-nodes, and members of that group will receive the `complete-with-scripts` config in the editor

To restrict the permission to a specific section, grant the role on that section's root node instead of the site root.

## How it works

### Permission enforcement (client-side)

The `complete` config ships with `htmlSupport.allow: [{ name: /.*/ }]`, a wildcard that inadvertently activates `ScriptElementSupport` for all users. Without a countermeasure, the YAML permission gate would have no real effect.

When this module loads it does two things:

1. **Patches `complete`** — adds `htmlSupport.disallow: [{ name: 'script' }]` to the existing registry entry. In GHS, `disallow` takes precedence over `allow`, so script support is suppressed for all users of `complete`.
2. **Creates `complete-with-scripts`** — built from the original `complete` (before the patch) with `{ name: 'script', attributes: true }` added to `htmlSupport.allow`. Script support is active only for this config.

The YAML then selects the appropriate config per user based on the permission. The gate is **client-side only** — `html-filtering` (step 2) applies to all users equally and is required for scripts to survive save regardless of which config was used.

### CKEditor 5 internals

`ScriptElementSupport` (a plugin inside `GeneralHtmlSupport`) handles the two CKEditor blocks:

- **`registerRawContentMatcher({ name: 'script' })`** — instructs `DomConverter` to store the raw script body as a `$rawContent` custom property on the view element instead of trying to process it as child nodes (which yields nothing).
- **Upcast** — reads `$rawContent` and stores it in the `htmlScript` model element's `htmlContent` attribute.
- **Data downcast** — restores the original `<script>` tag and body via `createRawElement`, bypassing `DomConverter`'s security check.

### Server-side — Jahia html-filtering

The `html-filtering` module runs OWASP Java HTML Sanitizer as a JCR interceptor. Every richtext property is sanitized before being stored. Since `<script>` is not in the default allowlist it is stripped on save even if CKEditor outputs it correctly. The custom YAML (step 2) adds it explicitly.

### Why a separate module?

Script support could have been added directly to `richtext-ckeditor5`. A separate module keeps the core untouched, makes the feature opt-in per environment, and avoids complicating future upgrades.

## Dependencies

- `richtext-ckeditor5` — provides the `complete` config, which includes `GeneralHtmlSupport` and its built-in `ScriptElementSupport`
- `html-filtering` — must be configured as described in step 2
