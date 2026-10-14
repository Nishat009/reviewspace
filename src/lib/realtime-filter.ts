/**
 * Whether a realtime event may be sent to a subscriber. Team-only events
 * (internal threads) never reach clients or share-link guests, so not even
 * the existence of an internal thread leaks over the stream.
 */
export function canReceive(event: { internal?: boolean; type: string }, seesInternal: boolean) {
  if (event.type === "access.changed") return false; // handled server-side
  return !event.internal || seesInternal;
}
