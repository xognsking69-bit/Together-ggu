import type { AppState } from './types';

// Local file/blob URIs are device-specific, not portable image backups.
export function portableBackupState(state: AppState): AppState {
  return { ...state, trips: state.trips.map(trip=>({
    ...trip, expenses: trip.expenses.map(expense=>{
      const { receiptUri, ...portable } = expense as typeof expense & {receiptUri?:string};
      return portable;
    })
  })) };
}
