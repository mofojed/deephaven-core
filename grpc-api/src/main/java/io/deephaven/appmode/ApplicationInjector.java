package io.deephaven.appmode;

import io.deephaven.db.appmode.Application;
import io.deephaven.db.appmode.ApplicationConfig;
import io.deephaven.db.appmode.Field;
import io.deephaven.db.tables.Table;
import io.deephaven.db.util.ScriptSession;
import io.deephaven.db.v2.TableMap;
import io.deephaven.grpc_api.console.GlobalSessionProvider;
import io.deephaven.internal.log.LoggerFactory;
import io.deephaven.io.logger.Logger;

import javax.inject.Inject;
import java.io.IOException;
import java.util.List;
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

        for (Field<?> field : application.fields()) {

            // todo: use registration pattern based on class name

            Object value = field.value();
            if (value instanceof Table) {
                log.debug().append("Application '").append(application.name()).append("', managing Table '").append(field.name()).append('\'').endl();
                session.setVariable(field.name(), value);
                session.manage((Table)value);
            } else if (value instanceof TableMap) {
                log.debug().append("Application '").append(application.name()).append("', managing TableMap '").append(field.name()).append('\'').endl();
                session.setVariable(field.name(), value);
                session.manage((TableMap)value);
            } else {
                log.warn().append("Application '").append(application.name()).append("', unable to manage '").append(field.name()).append('\'').endl();
            }
        }
    }
}
