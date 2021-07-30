package io.deephaven.db.appmode;

import org.immutables.value.Value.Check;
import org.immutables.value.Value.Immutable;

import javax.lang.model.SourceVersion;
import java.util.Optional;

@Immutable
public abstract class Field<T> {

    public static <T> Field<T> of(String name, T value) {
        return ImmutableField.<T>builder().name(name).value(value).build();
    }

    public static <T> Field<T> of(String name, T value, String description) {
        return ImmutableField.<T>builder().name(name).value(value).description(description).build();
    }

    public abstract String name();

    public abstract T value();

    public abstract Optional<String> description();

    @Check
    final void checkName() {
        if (!SourceVersion.isName(name())) {
            throw new IllegalArgumentException("name() is invalid, must conform to javax.lang.model.SourceVersion#isName");
        }
    }

    @Check
    final void checkDescription() {
        if (description().isPresent() && description().get().isEmpty()) {
            throw new IllegalArgumentException("description(), when present, must not be empty");
        }
    }
}
