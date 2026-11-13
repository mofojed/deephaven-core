const NANOS_PER_MILLI = 1_000_000n;

/**
 * An instant in time with nanosecond precision, as a Deephaven `Instant` (or `ZonedDateTime`) column holds. Wraps the
 * number of nanoseconds since the Unix epoch, which a JS `Date` cannot represent exactly.
 */
export class DateTime {
  constructor(readonly epochNanos: bigint) {}

  static fromDate(date: Date): DateTime {
    return new DateTime(BigInt(date.getTime()) * NANOS_PER_MILLI);
  }

  /** Milliseconds since the epoch, rounded down; loses the sub-millisecond part. */
  get epochMillis(): number {
    const nanos = this.epochNanos;
    const millis = nanos / NANOS_PER_MILLI;
    // bigint division truncates toward zero; round down instead, as a Date would
    return Number(nanos < 0n && millis * NANOS_PER_MILLI !== nanos ? millis - 1n : millis);
  }

  /** A JS Date for this instant, truncated to millisecond precision. */
  toDate(): Date {
    return new Date(this.epochMillis);
  }

  /** ISO-8601 in UTC with all nine fractional digits, such as `2024-01-02T03:04:05.123456789Z`. */
  toString(): string {
    const millis = this.epochMillis;
    const subMilliNanos = this.epochNanos - BigInt(millis) * NANOS_PER_MILLI;
    const iso = new Date(millis).toISOString();
    return `${iso.substring(0, iso.length - 1)}${subMilliNanos.toString().padStart(6, '0')}Z`;
  }

  toJSON(): string {
    return this.toString();
  }

  equals(other: unknown): boolean {
    return other instanceof DateTime && other.epochNanos === this.epochNanos;
  }
}
