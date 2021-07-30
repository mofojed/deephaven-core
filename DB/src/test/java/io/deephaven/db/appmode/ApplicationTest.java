package io.deephaven.db.appmode;

import io.deephaven.db.v2.JUnit4QueryTableTestBase;
import org.junit.After;
import org.junit.Before;
import org.junit.Ignore;
import org.junit.Test;

import static org.assertj.core.api.Assertions.assertThat;

public class ApplicationTest {

    private final JUnit4QueryTableTestBase base = new JUnit4QueryTableTestBase();

    @Before
    public void setUp() throws Exception {
        base.setUp();
    }

    @After
    public void tearDown() throws Exception {
        base.tearDown();
    }

    @Test
    public void app00() {
        Application application = Application.of(ApplicationConfigs.app00());
        assertThat(application.name()).isEqualTo("My Class Application");
        assertThat(application.output()).containsOnlyKeys("hello", "world");
        assertThat(application.output().get("hello")).isInstanceOf(FieldTable.class);
        assertThat(application.output().get("world")).isInstanceOf(FieldTable.class);
    }

    @Test
    public void app01() {
        Application application = Application.of(ApplicationConfigs.app01());
        assertThat(application.name()).isEqualTo("My Groovy Application");
        assertThat(application.output()).containsOnlyKeys("hello", "world");
        assertThat(application.output().get("hello")).isInstanceOf(FieldTable.class);
        assertThat(application.output().get("world")).isInstanceOf(FieldTable.class);
    }

    @Test
    @Ignore("todo")
    public void app02() {
        Application application = Application.of(ApplicationConfigs.app02());
        assertThat(application.name()).isEqualTo("My Python Application");
        assertThat(application.output()).containsOnlyKeys("hello", "world");
        assertThat(application.output().get("hello")).isInstanceOf(FieldTable.class);
        assertThat(application.output().get("world")).isInstanceOf(FieldTable.class);
    }

    @Test
    @Ignore("todo")
    public void app03() {
        Application application = Application.of(ApplicationConfigs.app03());
        assertThat(application.name()).isEqualTo("My QST Application");
        assertThat(application.output()).containsOnlyKeys("hello", "world");
        assertThat(application.output().get("hello")).isInstanceOf(FieldTable.class);
        assertThat(application.output().get("world")).isInstanceOf(FieldTable.class);
    }
}
