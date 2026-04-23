/**
 * A server-exported table. First-slice scope: just exposes `size()`.
 *
 * Note: `size()` currently resolves to whatever the server reported in the
 * initial `ExportedTableCreationResponse`. It does not yet subscribe to
 * updates, so for ticking tables this value will go stale. Real subscription
 * plumbing is a follow-up.
 */
export class Table {
  readonly name: string;
  readonly ticket: Uint8Array;
  private readonly initialSize: number;

  constructor(args: { name: string; ticket: Uint8Array; size: number }) {
    this.name = args.name;
    this.ticket = args.ticket;
    this.initialSize = args.size;
  }

  async size(): Promise<number> {
    return this.initialSize;
  }
}
