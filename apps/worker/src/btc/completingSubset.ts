type ChildTx = {
  amount_sats: bigint;
  confirmations: number;
  detected_at: Date;
};

/**
 * Returns the minimum confirmation count across the subset of child txs
 * needed to reach `expectedSats`, prioritizing earliest-detected txs.
 *
 * Returns `null` if the children don't reach the threshold.
 */
export function completingSubsetMinConf(
  children: ChildTx[],
  expectedSats: bigint,
): number | null {
  if (children.length === 0 || expectedSats <= 0n) return null;

  const sorted = [...children].sort(
    (a, b) => a.detected_at.getTime() - b.detected_at.getTime(),
  );

  let accumulated = 0n;
  let minConf = Infinity;

  for (const child of sorted) {
    accumulated += child.amount_sats;
    minConf = Math.min(minConf, child.confirmations);
    if (accumulated >= expectedSats) return minConf;
  }

  return null; // threshold not reached
}
