export interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  tokenWallet?: {
    balance: number;
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface SubscriptionState {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  tier: 'free' | 'pro' | 'sale';
}
