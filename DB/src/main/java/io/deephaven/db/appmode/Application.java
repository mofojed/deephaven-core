package io.deephaven.db.appmode;

import io.deephaven.api.BuildableStyle;
import io.deephaven.db.tables.Table;
import io.deephaven.db.v2.TableMap;
import org.immutables.value.Value.Immutable;

import java.util.Map;

@Immutable
@BuildableStyle
public abstract class Application {

    public interface Builder {

        Builder id(String id);

        Builder name(String name);

        Builder putOutput(String key, Output value);

        default Builder addOutput(String label, Table table) {
            return putOutput(label, Output.of(table));
        }

        default Builder addOutput(String label, TableMap tableMap) {
            return putOutput(label, Output.of(tableMap));
        }

        Application build();
    }

    public interface Factory {
        Application create();
    }

    public static Builder builder() {
        return ImmutableApplication.builder();
    }

    public static Application of(ApplicationConfig config) {
        return ApplicationExec.of(config);
    }


    /**
     * The application id, should be unique and unchanging.
     *
     * @return the application id
     */
    public abstract String id();

    /**
     * The application name
     * @return the application name
     */
    public abstract String name();

    /**
     * The labeled outputs
     * @return the labeled outputs
     */
    public abstract Map<String, Output> output(); // todo: should the keys be tickets?
}
