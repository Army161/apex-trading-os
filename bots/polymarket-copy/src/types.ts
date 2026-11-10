export interface Trade {
  id: string; timestamp: number; market: string; tokenId: string; outcome: string; title: string;
  side: 'BUY' | 'SELL'; size: number; price: number; usdc: number;
}
export interface Fill { tokenId: string; side: 'BUY' | 'SELL'; shares: number; price: number; notional: number; orderId: string; paper: boolean }
