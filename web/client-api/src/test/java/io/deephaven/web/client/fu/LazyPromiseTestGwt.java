//
// Copyright (c) 2016-2024 Deephaven Data Labs and Patent Pending
//
package io.deephaven.web.client.fu;

import com.google.gwt.junit.client.GWTTestCase;
import io.deephaven.web.client.api.LongWrapper;
import io.deephaven.web.client.api.i18n.JsNumberFormat;

/**
 * Test that the LazyPromise class behaves as expected
 */
public class LazyPromiseTestGwt extends GWTTestCase {
    @Override
    public String getModuleName() {
        return "io.deephaven.web.DeephavenUnitTest";
    }

    /** Only calls success callback when it is first, any subsequent calls to success or failure are no-op */
    public void testSuccess() {
        // Create a new LazyPromise that will resolve with the value 42
        LazyPromise<Integer> lazyPromise = new LazyPromise<>();

        boolean[] hasSucceded = new boolean[]{false};

        lazyPromise.asPromise().then(value -> {
            assertEquals(42, (int) value);

            // We make sure that the success is only called once
            assertEquals(false, hasSucceded[0]);
            hasSucceded[0] = true;
            return null;
        }, value -> {
            // Fail should never be called, because we called succeed first
            fail("Should not have failed");
            return null;
        });
        lazyPromise.succeed(42);
        lazyPromise.succeed(45);
        lazyPromise.fail(new RuntimeException("Should not have failed"));

        assertEquals(true, hasSucceded[0]);

        finishTest();
    }

    /** Only calls failure callback when it is first, any subsequent calls to success or failure are no-op */
    public void testFailure() {
        // Create a new LazyPromise that will resolve with the value 42
        LazyPromise<Integer> lazyPromise = new LazyPromise<>();

        boolean[] hasFailed = new boolean[]{false};

        lazyPromise.asPromise().then(value -> {
            // Success should never be called, because we called fail first
            fail("Should not have succeeded");
            return null;
        }, value -> {
            assertEquals("Should have failed", "Should have failed");

            // We make sure that the failure is only called once
            assertEquals(false, hasFailed[0]);
            hasFailed[0] = true;
            return null;
        });
        lazyPromise.fail(new RuntimeException("Should have failed"));
        lazyPromise.fail(new RuntimeException("Should not have failed"));
        lazyPromise.succeed(42);

        assertEquals(true, hasFailed[0]);

        finishTest();
    }
}
