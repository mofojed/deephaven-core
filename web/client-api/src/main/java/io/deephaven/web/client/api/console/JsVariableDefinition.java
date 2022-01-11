package io.deephaven.web.client.api.console;

import io.deephaven.javascript.proto.dhinternal.io.deephaven.proto.application_pb.FieldInfo;
import jsinterop.annotations.JsProperty;
import jsinterop.base.Js;
import jsinterop.base.JsPropertyMap;

public class JsVariableDefinition {
    private static final String JS_UNAVAILABLE = "js-constructed-not-available";

    private final String type;
    private final String title;
    private final String id;
    private final String description;
    private final String applicationId;
    private final String applicationName;

    private static final String[] WidgetTypeLookup = {JsVariableChanges.OTHERWIDGET, JsVariableChanges.TABLE, JsVariableChanges.PLUGIN};

    public static String getVariableTypeFromField(FieldInfo field) {
        int fieldCase = field.getFieldType().getFieldCase();
        if (fieldCase >= 1 && fieldCase <= WidgetTypeLookup.length) {
            String widgetType = WidgetTypeLookup[fieldCase - 1];
            if (widgetType.equals(JsVariableChanges.PLUGIN)) {
                return field.getFieldType().getPlugin().getName();
            }
            return widgetType;
        }
        return JsVariableChanges.OTHERWIDGET;
    }

    public JsVariableDefinition(String type, String title, String id, String description) {
        this.type = type;
        this.title = title == null ? JS_UNAVAILABLE : title;
        this.id = id;
        this.description = description == null ? JS_UNAVAILABLE : description;
        this.applicationId = "scope";
        this.applicationName = "";
    }

    public JsVariableDefinition(FieldInfo field) {
        this.type = getVariableTypeFromField(field);
        this.id = field.getTicket().getTicket_asB64();
        this.title = field.getFieldName();
        this.description = field.getFieldDescription();
        this.applicationId = field.getApplicationId();
        this.applicationName = field.getApplicationName();
    }

    @JsProperty
    public String getType() {
        return type;
    }

    @JsProperty
    @Deprecated
    public String getName() {
        return title;
    }

    @JsProperty
    public String getTitle() {
        return title;
    }

    @JsProperty
    public String getId() {
        return id;
    }

    @JsProperty
    public String getDescription() {
        return description;
    }

    @JsProperty
    public String getApplicationId() {
        return applicationId;
    }

    @JsProperty
    public String getApplicationName() {
        return applicationName;
    }
}
