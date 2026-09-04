"use client";

import { useCallback, useMemo, useRef, useState } from "react";

// Tap one, tap its partner (FR-ACT-03).

export type PairSide = "left" | "right";

export interface PairingSelection {
  side: PairSide;
  id: string;
}

export interface PairingCallbacks {
  isCorrectPair: (leftId: string, rightId: string) => boolean;
  onCorrect: (leftId: string, rightId: string) => void;
  onWrong: (leftId: string, rightId: string) => void;
  onAllMatched: () => void;
  totalPairs: number;
}

export interface PairingState {
  selected: PairingSelection | undefined;
  /** leftId → rightId, in the order the child matched them. */
  matched: ReadonlyMap<string, string>;
  isLocked: (id: string) => boolean;
  /** Which pair a locked card belongs to, for the shared highlight and line. */
  pairIndexOf: (id: string) => number | undefined;
  tap: (side: PairSide, id: string) => void;
}

export function usePairing({
  isCorrectPair,
  onCorrect,
  onWrong,
  onAllMatched,
  totalPairs,
}: PairingCallbacks): PairingState {
  const [selected, setSelected] = useState<PairingSelection | undefined>(
    undefined,
  );
  const [matched, setMatched] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );

  const lockedIds = useMemo(
    () => new Set([...matched.keys(), ...matched.values()]),
    [matched],
  );

  const isLocked = useCallback((id: string) => lockedIds.has(id), [lockedIds]);

  // Insertion order is the pair order, so the index a card gets never changes as
  // later pairs are matched — a highlight that shifted colour mid-activity would
  // undo the one thing it is there to say.
  const pairIndexOf = useCallback(
    (id: string) => {
      let index = 0;
      for (const [leftId, rightId] of matched) {
        if (leftId === id || rightId === id) return index;
        index += 1;
      }
      return undefined;
    },
    [matched],
  );

  // Once, and only once, however the last pair is reached.
  const hasReportedAll = useRef(false);

  const tap = useCallback(
    (side: PairSide, id: string) => {
      // A matched card is finished. Tapping it is not a mistake and gets no
      // encouragement — it simply does nothing.
      if (lockedIds.has(id)) return;

      if (selected === undefined) {
        setSelected({ side, id });
        return;
      }
      if (selected.id === id) {
        setSelected(undefined);
        return;
      }
      // A second tap in the same column is a change of mind, not an answer.
      if (selected.side === side) {
        setSelected({ side, id });
        return;
      }

      const leftId = side === "left" ? id : selected.id;
      const rightId = side === "left" ? selected.id : id;
      setSelected(undefined);

      if (!isCorrectPair(leftId, rightId)) {
        onWrong(leftId, rightId);
        return;
      }

      const next = new Map(matched).set(leftId, rightId);
      setMatched(next);
      onCorrect(leftId, rightId);

      if (next.size >= totalPairs && !hasReportedAll.current) {
        hasReportedAll.current = true;
        onAllMatched();
      }
    },
    [
      lockedIds,
      matched,
      selected,
      isCorrectPair,
      onCorrect,
      onWrong,
      onAllMatched,
      totalPairs,
    ],
  );

  return { selected, matched, isLocked, pairIndexOf, tap };
}
