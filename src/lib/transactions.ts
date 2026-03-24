import { collection, addDoc, updateDoc, doc, serverTimestamp, arrayUnion, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { settleTransaction } from './wallet';
import type { Transaction, OfferMessage, OfferStatus } from './types';

export async function createTransaction(data: {
  listingId: string;
  listingTitle: string;
  sellerId: string;
  sellerName: string;
  type: Transaction['type'];
  message: string;
  cashAmount: number | null;
  utAmount: number | null;
  swapListingIds: string[];
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const offer: OfferMessage = {
    fromUserId: user.uid,
    fromUserName: user.displayName || user.email || 'Anónimo',
    message: data.message,
    cashAmount: data.cashAmount,
    utAmount: data.utAmount,
    swapListingIds: data.swapListingIds,
    createdAt: null as any,
  };

  const docRef = await addDoc(collection(db, 'transactions'), {
    listingId: data.listingId,
    listingTitle: data.listingTitle,
    buyerId: user.uid,
    buyerName: user.displayName || user.email || 'Anónimo',
    sellerId: data.sellerId,
    sellerName: data.sellerName,
    type: data.type,
    status: 'proposed',
    offers: [offer],
    meetup: '',
    utTotal: data.utAmount || 0,
    cashTotal: data.cashAmount || 0,
    commissionUt: 0,
    commissionCash: 0,
    settled: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function addOffer(txId: string, message: string, cashAmount: number | null, utAmount: number | null, swapListingIds: string[]): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const offer: OfferMessage = {
    fromUserId: user.uid,
    fromUserName: user.displayName || user.email || 'Anónimo',
    message,
    cashAmount,
    utAmount,
    swapListingIds,
    createdAt: null as any,
  };

  // Update totals with the latest offer amounts
  const update: Record<string, any> = {
    offers: arrayUnion(offer),
    status: 'countered',
    updatedAt: serverTimestamp(),
  };
  if (utAmount != null) update.utTotal = utAmount;
  if (cashAmount != null) update.cashTotal = cashAmount;

  await updateDoc(doc(db, 'transactions', txId), update);
}

export async function updateTransactionStatus(txId: string, status: OfferStatus, meetup?: string): Promise<void> {
  const update: Record<string, any> = { status, updatedAt: serverTimestamp() };
  if (meetup !== undefined) update.meetup = meetup;
  await updateDoc(doc(db, 'transactions', txId), update);

  // On completion, settle balances and commission
  if (status === 'completed') {
    const snap = await getDoc(doc(db, 'transactions', txId));
    const tx = snap.data() as Transaction;
    if (tx && !tx.settled) {
      const { commissionUt, commissionCash } = await settleTransaction(txId, {
        buyerId: tx.buyerId,
        sellerId: tx.sellerId,
        utAmount: tx.utTotal || 0,
        cashAmount: tx.cashTotal || 0,
      });
      await updateDoc(doc(db, 'transactions', txId), {
        settled: true,
        commissionUt,
        commissionCash,
      });
    }
  }
}
