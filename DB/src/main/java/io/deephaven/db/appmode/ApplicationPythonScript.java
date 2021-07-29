package io.deephaven.db.appmode;

import io.deephaven.api.BuildableStyle;
import org.immutables.value.Value.Immutable;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;

@Immutable
@BuildableStyle
public abstract class ApplicationPythonScript implements ApplicationConfig {

    public static final String TYPE = "python";

    public static Builder builder() {
        return ImmutableApplicationPythonScript.builder();
    }

    public static ApplicationPythonScript parse(Properties properties) {
        return builder()
                .id(properties.getProperty("id"))
                .name(properties.getProperty("name"))
                .file(Paths.get(properties.getProperty("file")))
                .build();
    }

    public abstract String id();

    public abstract String name();

    public abstract Path file();

    @Override
    public final <V extends Visitor> V walk(V visitor) {
        visitor.visit(this);
        return visitor;
    }

    public interface Builder {

        Builder id(String id);

        Builder name(String name);

        Builder file(Path file);

        ApplicationPythonScript build();
    }
}
