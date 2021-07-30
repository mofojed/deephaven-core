package io.deephaven.db.appmode;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;
import io.deephaven.db.appmode.Fields.Builder;

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
        Map<String, Object> variables = new LinkedHashMap<>();
        Binding binding = new Binding(variables);
        GroovyShell groovyShell = new GroovyShell(binding);
        try {
            groovyShell.evaluate(script.file().toFile());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        Builder builder = Fields.builder();
        for (Map.Entry<String, Object> e : variables.entrySet()) {
            builder.addFields(Field.of(e.getKey(), e.getValue()));
        }
        out = Application.builder().id(script.id()).name(script.name()).fields(builder.build()).build();
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
