// Shared helpers for the @deephaven/jsapi examples.
import { CoreClient, DateTime } from '@deephaven/jsapi';

const ANONYMOUS_HANDLER = 'io.deephaven.auth.AnonymousAuthenticationHandler';

/** The pre-shared key in the page's URL (`?psk=...`), if any. */
export function urlPsk() {
  return new URL(window.location.href).searchParams.get('psk');
}

/** Keeps the `?psk=` parameter on links to other examples. */
export function keepPskOnLinks() {
  const psk = urlPsk();
  if (psk) {
    for (const link of document.querySelectorAll('a[href$=".html"]')) {
      const url = new URL(link.href);
      url.searchParams.set('psk', psk);
      link.href = url.href;
    }
  }
}

/**
 * Connects to the server that served this page, and logs in: with the pre-shared key from the URL if there is one,
 * anonymously if the server allows it, and otherwise with a key the user is asked for.
 */
export async function connect() {
  const client = new CoreClient(window.location.origin);
  let psk = urlPsk();
  if (!psk) {
    const authConfig = new Map(await client.getAuthConfigValues());
    const handlers = (authConfig.get('AuthHandlers') ?? '').split(',').map(handler => handler.trim());
    if (handlers.includes(ANONYMOUS_HANDLER)) {
      await client.login({ type: CoreClient.LOGIN_TYPE_ANONYMOUS });
      return client;
    }
    psk = window.prompt('Pre-shared key (printed in the server log at startup):');
  }
  await client.login({ type: CoreClient.LOGIN_TYPE_PSK, token: psk ?? '' });
  return client;
}

/** Formats a cell value from @deephaven/jsapi for display. */
export function formatValue(value) {
  if (value == null) {
    return '';
  }
  if (value instanceof DateTime) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(', ')}]`;
  }
  return String(value);
}

/**
 * Renders TableData into a <table> element, one row per row of the data, with a leading column of row positions.
 * `onHeaderClick`, if given, is called with a column when its header is clicked.
 */
export function renderTable(tableElement, data, { onHeaderClick, sorts = new Map() } = {}) {
  const header = document.createElement('thead');
  const headerRow = header.insertRow();
  headerRow.insertCell().textContent = '#';
  for (const column of data.columns) {
    const cell = headerRow.insertCell();
    cell.textContent = column.name;
    cell.title = column.type;
    const direction = sorts.get(column.name);
    if (direction) {
      cell.className = direction.toLowerCase();
    }
    if (onHeaderClick) {
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => onHeaderClick(column));
    }
  }
  const body = document.createElement('tbody');
  for (const row of data.rows) {
    const tr = body.insertRow();
    tr.insertCell().textContent = String(row.position);
    for (const column of data.columns) {
      tr.insertCell().textContent = formatValue(row.get(column));
    }
  }
  tableElement.replaceChildren(header, body);
}

/** Appends a line to the page's log element. */
export function log(message, className) {
  const element = document.getElementById('log');
  if (element) {
    const line = document.createElement('div');
    line.textContent = message;
    if (className) {
      line.className = className;
    }
    element.append(line);
  }
  console.log(message);
}

// Show failures on the page, such as a table operation the server rejected, rather than only in the console
function showError(error) {
  log(`Error: ${error?.message ?? error}`, 'error');
}
window.addEventListener('error', event => showError(event.error ?? event.message));
window.addEventListener('unhandledrejection', event => showError(event.reason));
