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
            if (registry.get('ckeditor5-config', 'completeWithScripts')) {
                return;
            }

            var anyPlugin = complete.plugins.find(function (p) {
                return p && typeof p === 'function' && p.pluginName;
            });

            if (!anyPlugin) {
                console.error('[richtext-ckeditor5-script-support] Could not find any plugin to derive Plugin base class');
                return;
            }

            var Plugin = Object.getPrototypeOf(anyPlugin);

            class ScriptElement extends Plugin {
                init() {
                    var editor = this.editor;
                    var schema = editor.model.schema;
                    var conversion = editor.conversion;

                    // CKEditor's domToView does not expose <script> text content as view children.
                    // Pre-encode inline script bodies as a data attribute before CKEditor parses
                    // the HTML — turning invisible content into an attribute the upcast can read.
                    // Object.create inherits all processor methods (registerRawContentMatcher, etc.)
                    // so only toView needs to be overridden.
                    var originalProcessor = editor.data.processor;
                    var processorWrapper = Object.create(originalProcessor);
                    processorWrapper.toView = function (data) {
                        var preprocessed = data.replace(
                            /<script(\s[^>]*)?>[\s\S]*?<\/script>/gi,
                            function (match, attrs) {
                                var bodyStart = match.indexOf('>') + 1;
                                var bodyEnd = match.lastIndexOf('</script>');
                                var body = match.substring(bodyStart, bodyEnd);
                                if (!body.trim()) {
                                    return match;
                                }
                                try {
                                    var encoded = btoa(unescape(encodeURIComponent(body)));
                                    return '<script' + (attrs || '') + ' data-cks-body="' + encoded + '"></script>';
                                } catch (e) {
                                    return match;
                                }
                            }
                        );
                        return originalProcessor.toView(preprocessed);
                    };
                    editor.data.processor = processorWrapper;

                    // Named 'scriptPreserved' to avoid collision with GeneralHtmlSupport,
                    // which auto-generates model element names as 'html' + PascalCase (e.g. 'htmlScript').
                    schema.register('scriptPreserved', {
                        allowWhere: '$block',
                        isObject: true,
                        allowAttributes: ['scriptAttributes', 'scriptContent']
                    });

                    // Upcast: <script> → scriptPreserved model element.
                    // High priority ensures this runs before GeneralHtmlSupport.
                    conversion.for('upcast').add(function (dispatcher) {
                        dispatcher.on('element:script', function (evt, data, conversionApi) {
                            if (!conversionApi.consumable.consume(data.viewItem, { name: true })) {
                                return;
                            }

                            var attributes = {};
                            var attrIter = data.viewItem.getAttributes();
                            var attrNext;
                            while (!(attrNext = attrIter.next()).done) {
                                attributes[attrNext.value[0]] = attrNext.value[1];
                            }

                            // Decode body pre-encoded by the processor wrapper
                            var content = '';
                            var encodedBody = attributes['data-cks-body'] || '';
                            if (encodedBody) {
                                try {
                                    content = decodeURIComponent(escape(atob(encodedBody)));
                                } catch (e) { /* ignore */ }
                                delete attributes['data-cks-body'];
                            }

                            var modelElement = conversionApi.writer.createElement('scriptPreserved', {
                                scriptAttributes: JSON.stringify(attributes),
                                scriptContent: content
                            });

                            if (!conversionApi.safeInsert(modelElement, data.modelCursor)) {
                                return;
                            }

                            conversionApi.updateConversionResult(modelElement, data);
                        }, { priority: 'high' });
                    });

                    // Editing downcast: render a styled placeholder.
                    // A real <script> is never put in the editing DOM.
                    conversion.for('editingDowncast').elementToElement({
                        model: 'scriptPreserved',
                        view: function (modelElement, ref) {
                            var writer = ref.writer;
                            var src = '';
                            try {
                                src = JSON.parse(modelElement.getAttribute('scriptAttributes') || '{}').src || '';
                            } catch (e) { /* ignore */ }

                            return writer.createRawElement('div', {
                                class: 'ck-script-element',
                                contenteditable: 'false'
                            }, function (domElement) {
                                domElement.style.cssText = 'background:#f5f0ff;border:1px dashed #9b59b6;border-radius:3px;padding:4px 8px;font-family:monospace;font-size:0.85em;color:#6c3483;cursor:default;margin:4px 0';
                                domElement.textContent = src ? ('<script src="' + src + '">') : '<script> (inline)';
                            });
                        }
                    });

                    // Data downcast: restore the original <script> element.
                    // createRawElement is processed before DomConverter's security check and goes through unblocked.
                    conversion.for('dataDowncast').elementToElement({
                        model: 'scriptPreserved',
                        view: function (modelElement, ref) {
                            var writer = ref.writer;
                            var content = modelElement.getAttribute('scriptContent') || '';
                            var attributes = {};
                            try {
                                attributes = JSON.parse(modelElement.getAttribute('scriptAttributes') || '{}');
                            } catch (e) { /* ignore */ }

                            return writer.createRawElement('script', attributes, function (domElement) {
                                domElement.textContent = content;
                            });
                        }
                    });
                }

                static get pluginName() {
                    return 'ScriptElement';
                }
            }

            registry.add('ckeditor5-config', 'completeWithScripts', Object.assign({}, complete, {
                plugins: complete.plugins.concat([ScriptElement])
            }));
        } catch (e) {
            console.error('[richtext-ckeditor5-script-support] Error:', e);
        }
    }
});
