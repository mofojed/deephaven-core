package io.deephaven.db.appmode;

import io.deephaven.db.appmode.Application.Factory;
import org.immutables.value.Value.Check;
import org.immutables.value.Value.Immutable;
import org.immutables.value.Value.Parameter;

import java.util.Properties;

@Immutable
public abstract class ApplicationClass<T extends Application.Factory> implements ApplicationConfig {

    public static final String TYPE = "class";

    public static <T extends Application.Factory> ApplicationClass<T> of(Class<T> clazz) {
        return ImmutableApplicationClass.of(clazz);
    }

    public static ApplicationClass<?> parse(Properties properties) throws ClassNotFoundException {
        Class<?> clazz = Class.forName(properties.getProperty("class"));
        //noinspection unchecked
        return of((Class<Factory>)clazz);
    }

    @Parameter
    public abstract Class<T> clazz();

    public final Application create() throws InstantiationException, IllegalAccessException {
        return clazz().newInstance().create();
    }

    @Override
    public final <V extends Visitor> V walk(V visitor) {
        visitor.visit(this);
        return visitor;
    }

    @Check
    final void checkClazz() {
        if (!Application.Factory.class.isAssignableFrom(clazz())) {
            throw new IllegalArgumentException(String.format("clazz should extend '%s'", Application.Factory.class));
        }
    }
}
