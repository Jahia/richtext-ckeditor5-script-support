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

            // Prevent double registration if callback fires more than once
            if (registry.get('ckeditor5-config', 'complete-with-scripts')) {
                return;
            }

            // GeneralHtmlSupport (already loaded in 'complete') ships with ScriptElementSupport,
            // which handles <script> preservation via registerRawContentMatcher + $rawContent.
            // Adding 'script' to htmlSupport.allow activates that built-in support.
            var existingAllow = (complete.htmlSupport && complete.htmlSupport.allow) || [];

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
