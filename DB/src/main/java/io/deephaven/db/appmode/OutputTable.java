package io.deephaven.db.appmode;

import io.deephaven.api.SimpleStyle;
import io.deephaven.db.tables.Table;
import org.immutables.value.Value.Immutable;
import org.immutables.value.Value.Parameter;

@Immutable
@SimpleStyle
abstract class OutputTable implements Output {

    public static OutputTable of(Table table) {
        return ImmutableOutputTable.of(table);
    }

    @Parameter
    public abstract Table table();

    @Override
    public final <V extends Visitor> V walk(V visitor) {
        visitor.visit(table());
        return visitor;
    }
}
