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

            // ScriptElementSupport is a plugin that ships inside GeneralHtmlSupport,
            // which is already loaded as part of the 'complete' config.
            // Adding 'script' to htmlSupport.allow activates it: the plugin calls
            // registerRawContentMatcher({ name: 'script' }) so that DomConverter stores
            // the raw script body as a '$rawContent' custom property instead of trying
            // to process it as child nodes (which would yield nothing). The upcast then
            // reads that property into the 'htmlScript' model element, and the data
            // downcast restores the original <script> tag via createRawElement, bypassing
            // DomConverter's security check.
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
