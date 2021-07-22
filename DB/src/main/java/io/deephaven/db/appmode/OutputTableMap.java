package io.deephaven.db.appmode;

import io.deephaven.api.SimpleStyle;
import io.deephaven.db.tables.Table;
import io.deephaven.db.v2.TableMap;
import org.immutables.value.Value.Immutable;
import org.immutables.value.Value.Parameter;

@Immutable
@SimpleStyle
abstract class OutputTableMap implements Output {

    public static OutputTableMap of(TableMap tableMap) {
        return ImmutableOutputTableMap.of(tableMap);
    }

    @Parameter
    public abstract TableMap tableMap();

    @Override
    public final <V extends Visitor> V walk(V visitor) {
        visitor.visit(tableMap());
        return visitor;
    }
}
