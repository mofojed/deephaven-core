package io.deephaven.db.appmode;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;
import io.deephaven.db.appmode.Application.Builder;
import io.deephaven.db.tables.Table;
import io.deephaven.db.v2.TableMap;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

class ApplicationExec implements ApplicationConfig.Visitor {

    public static Application of(ApplicationConfig config) {
        return config.walk(new ApplicationExec()).getOut();
    }

    private Application out;

    private ApplicationExec() { }

    public Application getOut() {
        return Objects.requireNonNull(out);
    }

    @Override
    public void visit(ApplicationGroovyScript script) {

        // todo: should we consider adding a "callback" to the context that scripts are expected to invoke for exports?
        // ie:
        //
        // t = ...
        // export("myTable", t)

        Map<String, Object> variables = new LinkedHashMap<>();
        Binding binding = new Binding(variables);
        GroovyShell groovyShell = new GroovyShell(binding);
        try {
            groovyShell.evaluate(script.file().toFile());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }

        Builder builder = Application.builder().id(script.id()).name(script.name());
        for (Map.Entry<String, Object> e : variables.entrySet()) {
            if (e.getValue() instanceof Table) {
                builder.addOutput(e.getKey(), (Table)e.getValue());
            } else if (e.getValue() instanceof TableMap) {
                builder.addOutput(e.getKey(), (TableMap)e.getValue());
            }
        }
        out = builder.build();
    }

    @Override
    public void visit(ApplicationPythonScript qst) {
        throw new UnsupportedOperationException("TODO, execute in a script query scope and get out the stuff");
    }

    @Override
    public void visit(ApplicationQST qst) {
        throw new UnsupportedOperationException("TODO, QST");
    }

    @Override
    public void visit(ApplicationClass<?> clazz) {
        try {
            out = clazz.create();
        } catch (InstantiationException | IllegalAccessException e) {
            throw new RuntimeException(e);
        }
    }
}
