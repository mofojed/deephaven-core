package io.deephaven.db.appmode;

import io.deephaven.api.SimpleStyle;
import org.immutables.value.Value.Immutable;
import org.immutables.value.Value.Parameter;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;

@Immutable
@SimpleStyle
public abstract class ApplicationPythonScript implements ApplicationConfig {

    public static ApplicationPythonScript of(String name, Path file) {
        return ImmutableApplicationPythonScript.of(name, file);
    }

    public static ApplicationPythonScript parse(Properties properties) {
        return of(
                properties.getProperty("name"),
                Paths.get(properties.getProperty("file")));
    }

    @Parameter
    public abstract String name();

    @Parameter
    public abstract Path file();

    @Override
    public final <V extends Visitor> V walk(V visitor) {
        visitor.visit(this);
        return visitor;
    }
}
