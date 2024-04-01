//
// Copyright (c) 2016-2024 Deephaven Data Labs and Patent Pending
//
package io.deephaven.web.client.fu;

import com.google.gwt.junit.client.GWTTestCase;
import elemental2.promise.Promise;
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
        delayTestFinish(1007);

        // Create a new LazyPromise that will resolve with the value 42
        LazyPromise<Integer> lazyPromise = new LazyPromise<>();

        boolean[] hasSucceded = new boolean[]{false};

        lazyPromise.onSuccess(value -> {
            assertEquals(42, (int) value);

            // We make sure that the success is only called once
            assertFalse(hasSucceded[0]);
            hasSucceded[0] = true;
        });
        lazyPromise.onFailure(value -> {
            // Fail should never be called, because we called succeed first
            fail("Should not have failed");
        });

        lazyPromise.succeed(42);
        lazyPromise.succeed(45);
        lazyPromise.fail(new RuntimeException("Should not have failed"));

        lazyPromise.asPromise().then(value -> {
            assertEquals(42, (int) value);

            // We make sure that the success is only called once
            assertTrue(hasSucceded[0]);
            finishTest();
            return null;
        }, value -> {
            // Fail should never be called, because we called succeed first
            fail("Should not have failed");
            return null;
        });
    }

    /** Only calls failure callback when it is first, any subsequent calls to success or failure are no-op */
    public void testFailure() {
        System.out.println("HELLLOOOOO\n\n\nFIODJSOIFJDSOIF");
        System.err.println("XXX WTFfFFFFFFFFFFFFFFFFFFFFFFF\n\n\n\n\n\n\n WOOOOO");
        JsLog.error("XXXX IS THIS LOGGED AT LESST???");
        delayTestFinish(1008);

        // Create a new LazyPromise that will resolve with the value 42
        LazyPromise<Integer> lazyPromise = new LazyPromise<>();

        boolean[] hasFailed = new boolean[]{false};

        lazyPromise.asPromise().then(value -> {
            // Success should never be called, because we called fail first
            fail("Should not have succeeded");
            return null;
        }, value -> {
            assertEquals("Should have failed", "Should have failed");
        fail("Booooom");
            // We make sure that the failure is only called once
            assertFalse(hasFailed[0]);
            hasFailed[0] = true;
            return null;
        });
        lazyPromise.onFailure(value -> {
            fail("onFailure called!! boooooom");
        });
        lazyPromise.fail(new RuntimeException("Should have failed"));
        lazyPromise.fail(new RuntimeException("Second failure should not trigger"));
        lazyPromise.succeed(42);

        lazyPromise.asPromise().then(value -> {
            // Success should never be called, because we called fail first
            fail("Should not have succeeded");
            return null;
        }, value -> {
            assertEquals("Should have failed", "Should have failed");

            // We make sure that the failure is only called once
            assertTrue(hasFailed[0]);
            finishTest();
            return null;
        });
    }

    public void testJsPromiseSuccess() {
        delayTestFinish(1011);

        Promise<Integer> promise = new Promise<>((resolve, reject) -> resolve.onInvoke(42));

        promise.then(value -> {
            assertEquals(42, (int) value);
            finishTest();
            return null;
        }, value -> {
            fail("Should not have failed");
            return null;
        });
    }

    public void testJsPromiseReject() {
        delayTestFinish(1012);

        Promise<Integer> promise = new Promise<>((resolve, reject) -> reject.onInvoke(new RuntimeException("Should have failed")));

        promise.then(value -> {
            fail("Should not have succeeded");
            return null;
        }, value -> {
            fail("Just checking something....");
            assertEquals("Should have failed", "Should have failed");
            finishTest();
            return null;
        });
    }
}
