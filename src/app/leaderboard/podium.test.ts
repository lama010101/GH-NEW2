import { describe, expect, it } from "vitest";

import { partitionPodium } from "./podium";

// MP-UIX-PORT-B-PODIUMFIX-1015-001 — the partition is positional and
// rank-value agnostic: podium = first min(3, n) entries, list = the rest.
// Own rank values pass through untouched; nothing is dropped or duplicated.

type Row = { player_id: string; rank: number | string };

const rows = (ranks: (number | string)[]): Row[] =>
  ranks.map((rank, i) => ({ player_id: `p${i}`, rank }));

const ranksOf = (rs: Row[]) => rs.map((r) => r.rank);

describe("partitionPodium", () => {
  it("tolerates string ranks without dropping or reordering entries", () => {
    const { podium, list } = partitionPodium(rows(["1", "1", "2", "3"]));
    expect(ranksOf(podium)).toEqual(["1", "1", "2"]);
    expect(ranksOf(list)).toEqual(["3"]);
  });

  it("5-way tie at rank 1: podium = first 3 by position, list = the other 2, nobody dropped", () => {
    const input = rows([1, 1, 1, 1, 1, 6]);
    const { podium, list } = partitionPodium(input);
    expect(ranksOf(podium)).toEqual([1, 1, 1]);
    expect(ranksOf(list)).toEqual([1, 1, 6]);
    expect(podium.length + list.length).toBe(input.length);
    expect([...podium, ...list]).toEqual(input);
  });

  it("exactly 3 entries: all on the podium, empty list", () => {
    const { podium, list } = partitionPodium(rows([1, 2, 3]));
    expect(ranksOf(podium)).toEqual([1, 2, 3]);
    expect(list).toEqual([]);
  });

  it("2 entries: 2 podium slots, empty list", () => {
    const { podium, list } = partitionPodium(rows([1, 2]));
    expect(podium).toHaveLength(2);
    expect(list).toEqual([]);
  });

  it("1 entry: 1 podium slot, empty list", () => {
    const { podium, list } = partitionPodium(rows([1]));
    expect(podium).toHaveLength(1);
    expect(list).toEqual([]);
  });

  it("empty input: empty podium and list", () => {
    const { podium, list } = partitionPodium([]);
    expect(podium).toEqual([]);
    expect(list).toEqual([]);
  });

  it("non-contiguous ranks 1,1,3,4,4,6: positional split keeps own ranks", () => {
    const input = rows([1, 1, 3, 4, 4, 6]);
    const { podium, list } = partitionPodium(input);
    expect(ranksOf(podium)).toEqual([1, 1, 3]);
    expect(ranksOf(list)).toEqual([4, 4, 6]);
    expect([...podium, ...list]).toEqual(input);
  });
});
