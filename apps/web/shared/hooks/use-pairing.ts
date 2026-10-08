"use client";

import { useCallback, useMemo, useRef, useState } from "react";

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
  matched: ReadonlyMap<string, string>;
  isLocked: (id: string) => boolean;
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

  // Insertion order is the pair order, so a card's index never shifts as later pairs match.
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

  const hasReportedAll = useRef(false);

  const tap = useCallback(
    (side: PairSide, id: string) => {
      // A matched card is finished: tapping it gets no encouragement.
      if (lockedIds.has(id)) return;

      if (selected === undefined) {
        setSelected({ side, id });
        return;
      }
      if (selected.id === id) {
        setSelected(undefined);
        return;
      }
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
