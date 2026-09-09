export type Person = { id: string; name: string };

export type Expense = {
  id: string;
  title: string;
  category: string;
  date: string;
  amount: number;
  currency: "KRW" | "JPY" | "USD" | "EUR";
  rate: number;
  krwAmount: number;
  payerId: string;
  participantIds: string[];
};

export type CheckItem = { id: string; text: string; done: boolean };
export type UserProfile = { id: string; name: string };

export type Trip = {
  id: string;
  name: string;
  start: string;
  end: string;
  budget: number;
  baseCurrency: "KRW";
  people: Person[];
  expenses: Expense[];
  checklist: CheckItem[];
};

export type AppState = {
  profile: UserProfile;
  activeTripId: string;
  trips: Trip[];
};
