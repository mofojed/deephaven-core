package io.deephaven.db.appmode;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Properties;
import java.util.stream.Stream;

class ApplicationConfigImpl {

    static final String APPLICATION_DIR_PROP = "Application.dir";

    static final String APPLICATION_DIR = System.getProperty(APPLICATION_DIR_PROP, null);

    static List<ApplicationConfig> find(Path dir) throws IOException, ClassNotFoundException {
        try (Stream<Path> stream = Files.list(dir).filter(ApplicationConfigImpl::isAppFile).sorted()) {
            List<ApplicationConfig> configs = new ArrayList<>();
            Iterator<Path> it = stream.iterator();
            while (it.hasNext()) {
                configs.add(parse(it.next()));
            }
            return configs;
        }
    }

    static boolean isAppFile(Path path) {
        return path.getFileName().toString().endsWith(".app")
                && Files.isReadable(path)
                && Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS);
    }

    static ApplicationConfig parse(Path file) throws IOException, ClassNotFoundException {
        Properties properties = new Properties();
        try (BufferedReader reader = Files.newBufferedReader(file)) {
            properties.load(reader);
        }
        String type = properties.getProperty("type");
        switch (type) {
            case "qst":
                return ApplicationQST.parse(properties);
            case "groovy":
                return ApplicationGroovyScript.parse(properties);
            case "python":
                return ApplicationPythonScript.parse(properties);
            case "class":
                return ApplicationClass.parse(properties);
        }
        throw new IllegalArgumentException("Unexpected type " + type);
    }
}
