import { doc, runTransaction, collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { DEFAULT_CONFIG } from './types';
import type { WalletEntry, PlatformConfig } from './types';

const PLATFORM_UID = '__platform__';

async function loadConfig(): Promise<PlatformConfig> {
  const snap = await getDoc(doc(db, 'config', 'platform'));
  return snap.exists() ? { ...DEFAULT_CONFIG, ...snap.data() } as PlatformConfig : { ...DEFAULT_CONFIG };
}

/**
 * Settle a completed transaction:
 * - Swap part: transfer Gestos from buyer → seller, deduct commission
 * - Cash part: log commission owed (cash collected offline)
 * Commission rate depends on buyer's verified status.
 */
export async function settleTransaction(txId: string, opts: {
  buyerId: string;
  sellerId: string;
  utAmount: number;
  cashAmount: number;
}): Promise<{ commissionUt: number; commissionCash: number }> {
  const { buyerId, sellerId, utAmount, cashAmount } = opts;

  // Load config + buyer verification status
  const [cfg, buyerSnap] = await Promise.all([
    loadConfig(),
    getDoc(doc(db, 'users', buyerId)),
  ]);
  const isVerified = buyerSnap.data()?.verified === true;
  const rate = isVerified ? cfg.commissionVerified : cfg.commissionUnverified;

  const commissionUt = Math.round(utAmount * rate * 100) / 100;
  const commissionCash = Math.round(cashAmount * rate * 100) / 100;
  const sellerReceivesUt = utAmount - commissionUt;
  const pct = (rate * 100).toFixed(1);

  if (utAmount > 0) {
    await runTransaction(db, async (t) => {
      const buyerRef = doc(db, 'users', buyerId);
      const sellerRef = doc(db, 'users', sellerId);
      const bSnap = await t.get(buyerRef);
      const sSnap = await t.get(sellerRef);

      const buyerBalance = bSnap.data()?.walletBalance || 0;
      if (buyerBalance < utAmount) {
        throw new Error(`Saldo insuficiente: tienes ✦${buyerBalance} y se necesitan ✦${utAmount}`);
      }

      t.update(buyerRef, { walletBalance: buyerBalance - utAmount });
      t.update(sellerRef, { walletBalance: (sSnap.data()?.walletBalance || 0) + sellerReceivesUt });
    });

    await Promise.all([
      addLedgerEntry({ userId: buyerId, amount: -utAmount, type: 'swap_out', txId, description: `Compartiste gestos` }),
      addLedgerEntry({ userId: sellerId, amount: sellerReceivesUt, type: 'swap_in', txId, description: `Recibiste gestos (neto)` }),
      addLedgerEntry({ userId: PLATFORM_UID, amount: commissionUt, type: 'commission', txId, description: `Comisión ${pct}% intercambio` }),
    ]);
  }

  if (commissionCash > 0) {
    await addLedgerEntry({ userId: PLATFORM_UID, amount: commissionCash, type: 'commission', txId, description: `Comisión ${pct}% efectivo ($${cashAmount})` });
  }

  return { commissionUt, commissionCash };
}

/** Add Gestos to a user's wallet */
export async function addUtToWallet(userId: string, amount: number, description: string): Promise<void> {
  await runTransaction(db, async (t) => {
    const ref = doc(db, 'users', userId);
    const snap = await t.get(ref);
    const current = snap.data()?.walletBalance || 0;
    t.update(ref, { walletBalance: current + amount });
  });
  await addLedgerEntry({ userId, amount, type: 'bonus', txId: '', description });
}

/** Get wallet history for a user */
export async function getWalletHistory(userId: string, max = 50): Promise<(WalletEntry & { id: string })[]> {
  const q = query(
    collection(db, 'wallet_ledger'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as WalletEntry & { id: string }));
}

async function addLedgerEntry(entry: Omit<WalletEntry, 'createdAt'>): Promise<void> {
  await addDoc(collection(db, 'wallet_ledger'), {
    ...entry,
    createdAt: serverTimestamp(),
  });
}
