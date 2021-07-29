package io.deephaven.db.appmode;

import io.deephaven.db.tables.utils.TableTools;

import java.nio.file.Path;
import java.nio.file.Paths;

public class ApplicationConfigs {
    static ApplicationClass<ClassApplication> app00() {
        return ApplicationClass.of(ClassApplication.class);
    }

    static ApplicationGroovyScript app01() {
        return ApplicationGroovyScript.builder().id(ApplicationConfigs.class.getName() + ".app01").name("My Groovy Application").file(resolve("01-groovy.groovy")).build();
    }

    static ApplicationPythonScript app02() {
        return ApplicationPythonScript.builder().id(ApplicationConfigs.class.getName() + ".app02").name("My Python Application").file(resolve("02-python.py")).build();
    }

    static ApplicationQST app03() {
        return ApplicationQST.of(resolve("03-qst.qst"));
    }

    static Path resolve(String path) {
        return testAppDir().resolve(path);
    }

    static Path testAppDir() {
        // TODO: figure out why we do this in our top level build.gradle
        // b/c referring to the checked out directory name "deephaven-core" is very fragile
        //workingDir = "$rootDir/.."
        return Paths.get("deephaven-core/DB/src/test/app.d");
    }

    public static class ClassApplication implements Application.Factory {

        @Override
        public final Application create() {
            return Application.builder()
                    .id(ClassApplication.class.getName())
                    .name("My Class Application")
                    .addOutput("hello", TableTools.emptyTable(42))
                    .addOutput("world", TableTools.timeTable("00:00:01"))
                    .build();
        }
    }
}
