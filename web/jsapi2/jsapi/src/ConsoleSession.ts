import type * as Core from '@deephaven/jsapi-core';
import type { Connection } from './connection/Connection.js';

/** A variable created, updated or removed on the server. */
export interface VariableDefinition {
  /** The variable's name. */
  readonly name: string;
  /** The type of object, such as `Table`, or an empty string when the server does not know it. */
  readonly type: string;
  readonly description: string;
}

export interface VariableChanges {
  readonly created: readonly VariableDefinition[];
  readonly updated: readonly VariableDefinition[];
  readonly removed: readonly VariableDefinition[];
}

export interface CommandResult {
  /** The variables the code created, changed or removed. */
  readonly changes: VariableChanges;
  /** The error the code raised, or null if it ran successfully. */
  readonly error: string | null;
}

/** A script session on the server (such as Python or Groovy) that runs code and holds variables. */
export class ConsoleSession {
  private closed = false;

  /** @internal Created by {@link CoreClient.startSession}. */
  constructor(
    private readonly connection: Connection,
    private readonly ticket: Uint8Array,
    /** The session's language, such as `python` or `groovy`. */
    readonly type: string
  ) {}

  /** Runs code in the session. Fetch tables it creates with {@link CoreClient.getObject}. */
  async runCode(code: string): Promise<CommandResult> {
    if (this.closed) {
      throw new Error('Console session is closed');
    }
    const { console: consoleProto } = this.connection.core;
    const response = await this.connection.rpc.unary(consoleProto.ConsoleService.method.executeCommand, {
      consoleId: { ticket: this.ticket },
      code,
    });
    const variables = (fields: readonly Core.application.FieldInfo[]) =>
      fields.map(field =>
        Object.freeze({
          name: field.fieldName,
          type: field.typedTicket?.type ?? '',
          description: field.fieldDescription,
        })
      );
    return Object.freeze({
      error: response.errorMessage === '' ? null : response.errorMessage,
      changes: Object.freeze({
        created: variables(response.changes?.created ?? []),
        updated: variables(response.changes?.updated ?? []),
        removed: variables(response.changes?.removed ?? []),
      }),
    });
  }

  /** Releases the session on the server. Variables it created remain in the server's scope. */
  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.connection.releaseTicket(this.ticket);
    }
  }
}
