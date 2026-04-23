/** Barrage `app_metadata` message types. Mirrors the Java generated enum. */
export const BarrageMessageType = {
  None: 0,
  BarrageSerializationOptions: 4,
  BarrageSubscriptionRequest: 5,
  BarrageUpdateMetadata: 6,
  BarrageSnapshotRequest: 7,
  BarragePublicationRequest: 8,
} as const;

export type BarrageMessageType = (typeof BarrageMessageType)[keyof typeof BarrageMessageType];

/**
 * The ASCII magic `dphn` as a little-endian uint32, used to tag Barrage
 * `app_metadata` bytes. Matches the value the server looks for.
 */
export const BARRAGE_MAGIC = 0x6e687064;
