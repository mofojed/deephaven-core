package io.deephaven.appmode;

import io.deephaven.db.appmode.Application;
import io.deephaven.db.appmode.ApplicationConfig;
import io.deephaven.db.appmode.Output;
import io.deephaven.db.tables.Table;
import io.deephaven.db.util.ScriptSession;
import io.deephaven.db.v2.TableMap;
import io.deephaven.grpc_api.console.GlobalSessionProvider;
import io.deephaven.internal.log.LoggerFactory;
import io.deephaven.io.logger.Logger;

import javax.inject.Inject;
import java.io.IOException;
import java.util.List;
import java.util.Map.Entry;
import java.util.Objects;

public class ApplicationInjector {

    private static final Logger log = LoggerFactory.getLogger(ApplicationInjector.class);

    private final GlobalSessionProvider globalSessionProvider;

    @Inject
    public ApplicationInjector(GlobalSessionProvider globalSessionProvider) {
        this.globalSessionProvider = Objects.requireNonNull(globalSessionProvider);
    }

    public void run() throws IOException, ClassNotFoundException {
        if (!ApplicationConfig.isEnabled()) {
            return;
        }

        log.info().append("Finding application(s)...").endl();
        List<ApplicationConfig> configs = ApplicationConfig.find();

        if (configs.isEmpty()) {
            log.warn().append("No application(s) found...").endl();
            return;
        }

        if (configs.size() > 1) {
            throw new UnsupportedOperationException("TODO: support multiple applications");
        }

        ApplicationConfig config = configs.get(0);
        log.info().append("Found application config: ").append(config.toString()).endl();

        Application application = Application.of(config);
        log.info().append("Starting application '").append(application.name()).append('\'').endl();

        ScriptSession session = globalSessionProvider.getGlobalSession();
        for (Entry<String, Output> e : application.output().entrySet()) {
            e.getValue().walk(new ManageOutput(session, application.name(), e.getKey()));
        }
    }

    private static class ManageOutput implements Output.Visitor {
        private final ScriptSession session;
        private final String appName;
        private final String name;

        ManageOutput(ScriptSession session, String appName, String name) {
            this.session = Objects.requireNonNull(session);
            this.appName = Objects.requireNonNull(appName);
            this.name = Objects.requireNonNull(name);
        }

        @Override
        public void visit(Table table) {
            log.debug().append("Application '").append(appName).append("', managing Table '").append(name).append('\'').endl();
            session.setVariable(name, table);
            session.manage(table);
        }

        @Override
        public void visit(TableMap tableMap) {
            log.debug().append("Application '").append(appName).append("', managing TableMap '").append(name).append('\'').endl();
            session.setVariable(name, tableMap);
            session.manage(tableMap);
        }
    }
}
