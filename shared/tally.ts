import type { PublicParticipant, Slot, SlotTally } from "./types"

/**
 * Counts every slot's answers. Shared by the worker and the in-browser demo,
 * so the demo's numbers can never drift from the real ones.
 */
export function tallySlots(
  slots: Pick<Slot, "id">[],
  participants: Pick<PublicParticipant, "name" | "votes">[],
  opts: { quorum: number | null; capacity: number | null; countMaybe: boolean },
): SlotTally[] {
  const { quorum, capacity, countMaybe } = opts
  return slots.map((slot) => {
    const t: SlotTally = {
      slotId: slot.id,
      yes: 0,
      maybe: 0,
      no: 0,
      score: 0,
      meetsQuorum: false,
      spotsLeft: null,
      full: false,
      yesNames: [],
      waitlistNames: [],
      maybeNames: [],
      noNames: [],
    }
    for (const p of participants) {
      const v = p.votes[slot.id]
      if (v === "yes") {
        t.yes++
        t.yesNames.push(p.name)
      } else if (v === "maybe") {
        t.maybe++
        t.maybeNames.push(p.name)
      } else if (v === "no") {
        t.no++
        t.noNames.push(p.name)
      }
    }
    t.score = countMaybe ? t.yes + t.maybe : t.yes
    t.meetsQuorum = quorum !== null && t.score >= quorum

    // The cap applies to 'in' votes only. Participants come back in join order,
    // so the first N to say yes hold the places and the rest wait.
    if (capacity !== null) {
      t.spotsLeft = Math.max(0, capacity - t.yes)
      t.full = t.yes >= capacity
      t.waitlistNames = t.yesNames.slice(capacity)
      t.yesNames = t.yesNames.slice(0, capacity)
    }
    return t
  })
}
