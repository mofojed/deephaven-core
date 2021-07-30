package io.deephaven.db.appmode;

import io.deephaven.api.BuildableStyle;
import org.immutables.value.Value.Immutable;

@Immutable
@BuildableStyle
public abstract class Application {

    public interface Builder {

        Builder id(String id);

        Builder name(String name);

        Builder fields(Fields fields);

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
     * The application name.
     *
     * @return the application name
     */
    public abstract String name();

    /**
     * The fields.
     *
     * @return the fields
     */
    public abstract Fields fields();
}
