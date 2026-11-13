/** Helpers to build the tickets that name objects on the server. */

const textEncoder = new TextEncoder();

/** An export ticket: `'e'` followed by the export id as a little-endian int32. */
export function exportTicket(exportId: number): Uint8Array {
  const bytes = new Uint8Array(5);
  bytes[0] = 'e'.charCodeAt(0);
  new DataView(bytes.buffer).setInt32(1, exportId, true);
  return bytes;
}

/** A query scope ticket, naming a variable on the server: `s/<name>`. */
export function scopeTicket(name: string): Uint8Array {
  return textEncoder.encode(`s/${name}`);
}

/** An application field ticket: `a/<applicationId>/f/<fieldName>`. */
export function applicationTicket(applicationId: string, fieldName: string): Uint8Array {
  return textEncoder.encode(`a/${applicationId}/f/${fieldName}`);
}

/** A string key for a ticket, to use in maps. */
export function ticketKey(ticket: Uint8Array): string {
  let s = '';
  for (let i = 0; i < ticket.length; i++) {
    s += String.fromCharCode(ticket[i]);
  }
  return s;
}
