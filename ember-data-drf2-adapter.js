var get = Ember.get, set = Ember.set;

DS.DRF2Serializer = DS.RESTSerializer.extend({

    /**
     * Add serialization support for arrays.
     */
    init: function() {
        this._super();
        this.registerTransform('array', {
            deserialize: function(serialized) {
                return Ember.isNone(serialized) ? null : Em.A(serialized);
            },
            serialize: function(deserialized) {
                // FIXME: deserialized doesn't have a toJSON() method.
                return Ember.isNone(deserialized) ? null : deserialized.toJSON();
            }
        });
    },

    /**
     * Changes from default:
     * - Don't call sideload() because DRF2 doesn't support it.
     * - Get results directly from json.
     */
    extract: function(loader, json, type, record) {

        this.extractMeta(loader, type, json);

        if (json) {
            if (record) {
                loader.updateId(record, json);
            }
            this.extractRecordRepresentation(loader, type, json);
        }
    },

    /**
     * Changes from default:
     * - Don't call sideload() because DRF2 doesn't support it.
     * - Get results from json.results or directly from json.
     */
    extractMany: function(loader, json, type, records) {

        this.extractMeta(loader, type, json);

        if (json['results'] || !Em.isEmpty(json)) {
            var references = [];
            var objects = json['results'] ? json['results'] : json;

            if (records) {
                records = records.toArray();
            }

            for (var i = 0; i < objects.length; i++) {
                if (records) {
                    loader.updateId(records[i], objects[i]);
                }
                var reference = this.extractRecordRepresentation(loader, type, objects[i]);
                references.push(reference);
            }

            loader.populateArray(references);
        }
    },

    /**
     * Changes from default:
     * - Don't append '_id' to the end of the key.
     */
    keyForBelongsTo: function(type, name) {
        return this.keyForAttributeName(type, name);
    },

    /**
     * Changes from default:
     * - Add support for marking attributes as readOnly.
     * https://github.com/emberjs/data/pull/303#issuecomment-14649231
     */
    addAttributes: function(data, record) {
        record.eachAttribute(function(name, attribute) {
            // Skip serializing the attribute if 'readOnly' is true in its mapping
            if (!this.mappingOption(record.constructor, name, 'readOnly')) {
                this._addAttribute(data, record, name, attribute.type);
            }
        }, this);
    }
});


DS.DRF2Adapter = DS.RESTAdapter.extend({

    /**
     * Use a custom serializer for DRF2.
     */
    serializer: DS.DRF2Serializer,

    /**
     * Bulk commits are not supported by this adapter.
     */
    bulkCommit: false,

    /**
     * DRF2 uses the 'next' keyword for paginating results.
     */
    since: 'next',


    /**
     * Changes from default:
     * - Don't embed record within 'root' in the json.
     */
    createRecord: function(store, type, record) {
        var root = this.rootForType(type);

        var data = {};
        data = this.serialize(record, { includeId: true });

        this.ajax(this.buildURL(root), "POST", {
            data: data,
            context: this,
            success: function(json) {
                Ember.run(this, function() {
                    this.didCreateRecord(store, type, record, json);
                });
            },
            error: function(xhr) {
                this.didError(store, type, record, xhr);
            }
        });

    },

    /**
     * Changes from default:
     * - Don't embed record within 'root' in the json.
     * TODO: Add support for multipart/form-data form submission.
     */
    updateRecord: function(store, type, record) {
        var id = get(record, 'id');
        var root = this.rootForType(type);

        var data = {};
        data = this.serialize(record);

        this.ajax(this.buildURL(root, id), "PUT", {
            data: data,
            context: this,
            success: function(json) {
                Ember.run(this, function() {
                    this.didSaveRecord(store, type, record, json);
                });
            },
            error: function(xhr) {
                this.didError(store, type, record, xhr);
            }
        });
    },

    /**
     * Changes from default:
     * - Check for status code 400 instead of 422.
     * - Set the response text directly, not from the 'errors' property.
     */
    didError: function(store, type, record, xhr) {
        if (xhr.status === 400) {
            var data = JSON.parse(xhr.responseText);
            store.recordWasInvalid(record, data);
        } else {
            // TODO: what does this do? Do we want the console log?
            this._super.apply(this, arguments);
            console.error("Unhandled server error with status code: " + xhr.status);
        }
    },

    /**
     * Changes from default:
     * - Don't replace CamelCase with '_'.
     * - Use the record's url field first if it's there.
     * - Check for 'url' defined in the class.
     */
    rootForType: function(type, record) {
        if (record !== undefined && record.hasOwnProperty('url')) {
            return record.url;
        }
        if (type.url) {
            return type.url;
        }
        if (type.proto().url) {
            return type.proto().url;
        }
        // use the last part of the name as the URL
        var parts = type.toString().split(".");
        var name = parts[parts.length - 1];
        return name.toLowerCase();
    },

    /**
     * Changes from default:
     * - Don't add 's' if the url name already ends with 's'.
     */
    pluralize: function(name) {
        if (this.plurals[name])
            return this.plurals[name];
        else if (name.charAt(name.length - 1) === 's')
            return name;
        else
            return name + 's';
    },

    /**
     * Changes from default:
     * - Add trailing slash for lists.
     */
    buildURL: function(record, suffix) {
        var url = this._super(record, suffix);
        if (suffix === undefined && url.charAt(url.length - 1) !== '/') {
            url += '/';
        }
        return url;
    }
});
