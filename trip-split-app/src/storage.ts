import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppState } from "./types";

const STORAGE_KEY = "trip-split-v13";

export async function loadState(): Promise<AppState | null> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export async function saveState(state: AppState) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function clearState() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
