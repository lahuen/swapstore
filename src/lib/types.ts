import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'support' | 'store' | 'people';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  firstName: string;
  lastName: string;
  cuit: string;                  // CUIT/CUIL for verification
  verified: boolean;             // true after admin validates identity
  suspended: boolean;            // true = blocked from using the platform
  role: UserRole;                // user role for access control
  location: string;
  bio: string;
  rating: number;
  ratingCount: number;
  walletBalance: number;         // Gestos balance
  createdAt: Timestamp;
}

export interface Report {
  fromUserId: string;
  fromUserName: string;
  targetType: 'listing' | 'user' | 'general';
  targetId: string;
  targetLabel: string;
  reason: string;
  status: 'pending' | 'resolved';
  createdAt: Timestamp;
}

export type TicketCategory = 'account' | 'transaction' | 'listing' | 'general';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'high' | 'normal' | 'low';

export interface TicketMessage {
  fromUserId: string;
  fromUserName: string;
  isStaff: boolean;
  body: string;
  createdAt: Timestamp;
}

export interface SupportTicket {
  creatorId: string;
  creatorName: string;
  creatorEmail: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  messages: TicketMessage[];
  assignedTo: string | null;      // uid of support/admin agent
  assignedName: string | null;
  relatedId: string;              // e.g. listing or transaction ID
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Listing {
  userId: string;
  userName: string;
  userPhoto: string;
  title: string;
  description: string;
  images: string[];          // Storage URLs
  type: 'product' | 'service';
  priceMode: 'cash' | 'swap' | 'both';
  cashPrice: number | null;  // null if swap-only
  swapHint: string;          // "Acepto clases de inglés, herramientas, etc."
  category: string;
  location: string;
  status: 'active' | 'paused' | 'traded';
  createdAt: Timestamp;
}

export type OfferStatus = 'proposed' | 'countered' | 'accepted' | 'rejected' | 'completed';

export interface OfferMessage {
  fromUserId: string;
  fromUserName: string;
  message: string;
  cashAmount: number | null;
  utAmount: number | null;     // unidades de trabajo offered
  swapListingIds: string[];    // listings offered in exchange
  createdAt: Timestamp;
}

export interface Transaction {
  listingId: string;
  listingTitle: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  type: 'cash' | 'swap' | 'mixed';
  status: OfferStatus;
  offers: OfferMessage[];
  meetup: string;              // free text: address or "a coordinar"
  // Commission & settlement
  utTotal: number;             // total UT in the deal
  cashTotal: number;           // total cash in the deal
  commissionUt: number;        // 1.5% commission in UT (swap part)
  commissionCash: number;      // 1.5% commission in cash (cash part)
  settled: boolean;            // true after balances were adjusted
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Wallet ledger entry — immutable log of all UT movements */
export interface WalletEntry {
  userId: string;
  amount: number;              // positive = credit, negative = debit
  type: 'topup' | 'swap_in' | 'swap_out' | 'commission' | 'bonus';
  txId: string;                // related transaction ID
  description: string;
  createdAt: Timestamp;
}

export interface PlatformConfig {
  gestoValueARS: number;         // 1 gesto = X ARS
  commissionVerified: number;    // e.g. 0.015 = 1.5%
  commissionUnverified: number;  // e.g. 0.03 = 3%
}

export const DEFAULT_CONFIG: PlatformConfig = {
  gestoValueARS: 1000,
  commissionVerified: 0.015,
  commissionUnverified: 0.03,
};

export type WithId<T> = T & { id: string };
