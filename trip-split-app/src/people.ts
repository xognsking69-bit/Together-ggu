import type { Trip } from './types';

export function personHasExpenses(trip: Trip, id: string): boolean {
  return trip.expenses.some(e => e.payerId === id || e.participantIds.includes(id) ||
    (e.customShares != null && Object.prototype.hasOwnProperty.call(e.customShares, id)));
}

// Never rewrite historical payment ownership or allocations when deleting a person.
// Returning the unchanged trip also protects against a newer shared snapshot.
export function removeUnusedPerson(trip: Trip, id: string, ownerId: string): Trip {
  if (id === ownerId || personHasExpenses(trip, id)) return trip;
  return { ...trip, people: trip.people.filter(p => p.id !== id) };
}
