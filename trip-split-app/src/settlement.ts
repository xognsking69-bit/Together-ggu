import type { Expense, Person } from "./types";

export type Balance = { paid: number; owed: number; net: number };

export function splitInteger(total: number, ids: string[]) {
  if (!ids.length) return {} as Record<string, number>;

  const amount = Math.round(total);
  const base = Math.floor(amount / ids.length);
  const remainder = amount - base * ids.length;

  const result: Record<string, number> = {};
  ids.forEach((id, index) => {
    result[id] = base + (index < remainder ? 1 : 0);
  });

  return result;
}

export function computeBalances(people: Person[], expenses: Expense[]) {
  const balances: Record<string, Balance> = {};

  people.forEach((person) => {
    balances[person.id] = { paid: 0, owed: 0, net: 0 };
  });

  expenses.forEach((expense) => {
    const payer = balances[expense.payerId];
    if (!payer || !expense.participantIds.length) return;

    const amount = Math.round(expense.krwAmount);
    payer.paid += amount;

    const shares = splitInteger(amount, expense.participantIds);
    Object.entries(shares).forEach(([id, share]) => {
      if (balances[id]) balances[id].owed += share;
    });
  });

  Object.values(balances).forEach((balance) => {
    balance.net = balance.paid - balance.owed;
  });

  return balances;
}

export function minimalTransfers(balances: Record<string, Balance>) {
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  Object.entries(balances).forEach(([id, balance]) => {
    const net = Math.round(balance.net);
    if (net > 0) creditors.push({ id, amount: net });
    if (net < 0) debtors.push({ id, amount: -net });
  });

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers: { from: string; to: string; amount: number }[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amount = Math.min(
      debtors[debtorIndex].amount,
      creditors[creditorIndex].amount
    );

    if (amount > 0) {
      transfers.push({
        from: debtors[debtorIndex].id,
        to: creditors[creditorIndex].id,
        amount,
      });
    }

    debtors[debtorIndex].amount -= amount;
    creditors[creditorIndex].amount -= amount;

    if (debtors[debtorIndex].amount === 0) debtorIndex++;
    if (creditors[creditorIndex].amount === 0) creditorIndex++;
  }

  return transfers;
}
