import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppState } from "./types";
import { createReceiptStateWriter, decodeStoredState } from './receipt-lifecycle';
import { removeOwnedReceiptCopy } from './receipt-files';

const STORAGE_KEY = "trip-split-v13";
const writer=createReceiptStateWriter(
  state=>AsyncStorage.setItem(STORAGE_KEY,JSON.stringify(state)),
  removeOwnedReceiptCopy,
);

export async function loadState(): Promise<AppState | null> {
  const saved = await AsyncStorage.getItem(STORAGE_KEY);
  const state=decodeStoredState(saved);
  writer.baseline(state);
  return state;
}

export const saveState = writer.save;
export const protectReceiptDraft = writer.setDraft;

export async function clearState() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
