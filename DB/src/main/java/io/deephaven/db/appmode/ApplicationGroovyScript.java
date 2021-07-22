package io.deephaven.db.appmode;

import io.deephaven.api.SimpleStyle;
import org.immutables.value.Value.Immutable;
import org.immutables.value.Value.Parameter;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;

@Immutable
@SimpleStyle
public abstract class ApplicationGroovyScript implements ApplicationConfig {

    public static ApplicationGroovyScript of(String name, Path file) {
        return ImmutableApplicationGroovyScript.of(name, file);
    }

    public static ApplicationGroovyScript parse(Properties properties) {
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
