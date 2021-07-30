package io.deephaven.db.appmode;

import org.immutables.value.Value.Immutable;
import org.immutables.value.Value.Parameter;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;

@Immutable
public abstract class ApplicationQST implements ApplicationConfig {

    public static final String TYPE = "qst";

    public static ApplicationQST of(Path file) {
        return ImmutableApplicationQST.of(file);
    }

    public static ApplicationQST parse(Properties properties) {
        return of(Paths.get(properties.getProperty("file")));
    }

    @Parameter
    public abstract Path file();

    @Override
    public final <V extends Visitor> V walk(V visitor) {
        visitor.visit(this);
        return visitor;
    }
}
