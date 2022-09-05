# e2e Tests

We use Playwright for our e2e tests. Currently it expects your server to already be running locally at port 10000.

## Running Tests

### From Command line

In this folder, run `npx playwright test` to run all tests. See [Playwright Running Tests docs](https://playwright.dev/docs/running-tests) for more details.

### From VS Code

Install the [VS Code Playwright Extension](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright). You can then click the little play button next to a test to run the test.

## Updating Snapshots

We have a lot of snapshots for charts and tables. To update snapshots, run `npx playwright test --update-snapshots`. See [Playwright Test Snapshots docs](https://playwright.dev/docs/test-snapshots) for more details.
