package io.deephaven.web.client.api.console;

import elemental2.core.JsArray;
import elemental2.core.JsObject;
import jsinterop.annotations.JsProperty;
import jsinterop.base.Js;

public class JsVariableChanges {
    @JsProperty(namespace = "dh.VariableType")
    public static final String TABLE = "Table",
            TREETABLE = "TreeTable",
            TABLEMAP = "TableMap",
            FIGURE = "Figure",
            OTHERWIDGET = "OtherWidget",
            PANDAS = "Pandas",
            PLUGIN = "Plugin";

    private final JsVariableDefinition[] created;
    private final JsVariableDefinition[] updated;
    private final JsVariableDefinition[] removed;

    public JsVariableChanges(JsVariableDefinition[] created, JsVariableDefinition[] updated,
            JsVariableDefinition[] removed) {
        this.created = JsObject.freeze(created);
        this.updated = JsObject.freeze(updated);
        this.removed = JsObject.freeze(removed);
    }

    @JsProperty
    public JsArray<JsVariableDefinition> getCreated() {
        return Js.uncheckedCast(created);
    }

    @JsProperty
    public JsArray<JsVariableDefinition> getUpdated() {
        return Js.uncheckedCast(updated);
    }

    @JsProperty
    public JsArray<JsVariableDefinition> getRemoved() {
        return Js.uncheckedCast(removed);
    }
}
