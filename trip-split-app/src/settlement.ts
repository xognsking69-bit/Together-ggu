import type { Expense, Person } from "./types";

export type Balance = { paid: number; owed: number; net: number };

export function parseCustomShareInputs(inputs: Record<string,string>, rate: number): Record<string,number> {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid exchange rate");
  return Object.fromEntries(Object.entries(inputs).map(([id,text])=>{
    const amount = Number(text);
    if (!text.trim() || !Number.isFinite(amount) || amount < 0) throw new Error("Invalid custom share input");
    return [id,amount*rate];
  }));
}

// customShares are KRW amounts, including any unrounded currency conversion.
// Round the combined total once, then distribute leftover won by fractional part.
function expenseShares(expense: Expense, ids: string[], amount: number) {
  if (expense.customShares == null) return splitInteger(amount, ids);
  const entries = Object.entries(expense.customShares);
  if (entries.some(([id, value]) => !ids.includes(id) || !Number.isFinite(value) || value < 0)) {
    throw new Error("Invalid custom shares");
  }
  const values = ids.map(id => expense.customShares![id] ?? 0);
  const sum = values.reduce((total, value) => total + value, 0);
  if (Math.abs(sum - expense.krwAmount) > Math.max(1e-6, Math.abs(sum) * Number.EPSILON * 16)) {
    throw new Error("Custom shares must match the expense total");
  }
  const shares = values.map(value => Math.floor(value));
  const remainder = amount - shares.reduce((total, value) => total + value, 0);
  const order = values.map((value, index) => ({ index, fraction: value - shares[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remainder; i++) shares[order[i].index]++;
  return Object.fromEntries(ids.map((id, index) => [id, shares[index]]));
}

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
    const ids = [...new Set(expense.participantIds)];
    if (!payer || !ids.length || ids.some(id => !balances[id])) {
      throw new Error("Expense references missing people");
    }
    if (!Number.isFinite(expense.krwAmount) || expense.krwAmount < 0 ||
        !Number.isSafeInteger(Math.round(expense.krwAmount))) {
      throw new Error("Invalid expense amount");
    }

    const amount = Math.round(expense.krwAmount);
    const shares = expenseShares(expense, ids, amount);
    payer.paid += amount;
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
