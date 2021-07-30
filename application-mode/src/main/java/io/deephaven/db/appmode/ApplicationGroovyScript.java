package io.deephaven.db.appmode;

import org.immutables.value.Value.Immutable;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;

@Immutable
public abstract class ApplicationGroovyScript implements ApplicationConfig {

    public static final String TYPE = "groovy";

    public static Builder builder() {
        return ImmutableApplicationGroovyScript.builder();
    }

    public static ApplicationGroovyScript parse(Properties properties) {
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

        ApplicationGroovyScript build();
    }
}
