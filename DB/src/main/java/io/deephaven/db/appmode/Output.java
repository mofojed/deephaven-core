package io.deephaven.db.appmode;

import io.deephaven.db.tables.Table;
import io.deephaven.db.v2.TableMap;

public interface Output {

    static Output of(Table table) {
        return OutputTable.of(table);
    }

    static Output of(TableMap tableMap) {
        return OutputTableMap.of(tableMap);
    }

    <V extends Visitor> V walk(V visitor);

    interface Visitor {
        void visit(Table table);

        void visit(TableMap tableMap);

        // todo
        //void visit(Figure figure);
    }
}
