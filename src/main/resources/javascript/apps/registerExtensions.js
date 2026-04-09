window.jahia.uiExtender.registry.add('callback', 'richtext-ckeditor5-script-support', {
    targets: ['jahiaApp-init:99.5'],
    callback: function () {
        try {
            var registry = window.jahia.uiExtender.registry;
            var complete = registry.get('ckeditor5-config', 'complete');

            if (!complete) {
                console.error('[richtext-ckeditor5-script-support] ckeditor5-config "complete" not found');
                return;
            }

            // Skip if already registered — either this callback fired twice,
            // or a future version of richtext-ckeditor5 ships this config natively.
            if (registry.get('ckeditor5-config', 'complete-with-scripts')) {
                return;
            }

            var existingAllow = (complete.htmlSupport && complete.htmlSupport.allow) || [];
            var existingDisallow = (complete.htmlSupport && complete.htmlSupport.disallow) || [];

            // Patch 'complete' to disallow <script>.
            // The wildcard { name: /.*/ } in htmlSupport.allow would otherwise activate
            // ScriptElementSupport for all users, bypassing the permission gate entirely.
            // In GHS, disallow takes precedence over allow.
            registry.addOrReplace('ckeditor5-config', 'complete', Object.assign({}, complete, {
                htmlSupport: Object.assign({}, complete.htmlSupport || {}, {
                    disallow: existingDisallow.concat([
                        { name: 'script' }
                    ])
                })
            }));

            // Create 'complete-with-scripts' from the original complete config (before the
            // disallow patch above) so that <script> is explicitly allowed for users who
            // hold the allow-script-in-richtext permission.
            // ScriptElementSupport (built into GeneralHtmlSupport) handles the actual
            // preservation: registerRawContentMatcher stores the raw body as $rawContent,
            // the upcast reads it into the htmlScript model element, and the data downcast
            // restores the <script> tag via createRawElement, bypassing DomConverter's
            // security check.
            registry.add('ckeditor5-config', 'complete-with-scripts', Object.assign({}, complete, {
                htmlSupport: Object.assign({}, complete.htmlSupport || {}, {
                    allow: existingAllow.concat([
                        {
                            name: 'script',
                            attributes: true,
                            classes: false,
                            styles: false
                        }
                    ])
                })
            }));
        } catch (e) {
            console.error('[richtext-ckeditor5-script-support] Error:', e);
        }
    }
});
