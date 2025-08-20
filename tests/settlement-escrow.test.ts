import { describe, it, expect, beforeEach } from "vitest";

interface Trade {
  seller: string;
  buyer: string;
  amount: bigint;
  price: bigint;
  escrowFunds: bigint;
  state: number;
  createdAt: number;
  lastUpdated: number;
  disputeReason?: string;
}

interface DisputeVote {
  vote: boolean;
}

interface MockContract {
  admin: string;
  paused: boolean;
  oracleEnabled: boolean;
  trades: Map<number, Trade>;
  disputeVotes: Map<string, DisputeVote>;
  TRADE_STATE_PENDING: number;
  TRADE_STATE_DELIVERED: number;
  TRADE_STATE_SETTLED: number;
  TRADE_STATE_DISPUTED: number;
  TRADE_STATE_CANCELLED: number;
  TRADE_TIMEOUT: number;
  MIN_TRADE_AMOUNT: bigint;
  ORACLE_PRINCIPAL: string;
  blockHeight: number;
  stxBalance: Map<string, bigint>;
  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  setOracleEnabled(caller: string, enabled: boolean): { value: boolean } | { error: number };
  createTrade(caller: string, tradeId: number, seller: string, amount: bigint, price: bigint): { value: boolean } | { error: number };
  confirmDelivery(caller: string, tradeId: number): { value: boolean } | { error: number };
  settleTrade(caller: string, tradeId: number): { value: boolean } | { error: number };
  cancelTrade(caller: string, tradeId: number): { value: boolean } | { error: number };
  initiateDispute(caller: string, tradeId: number, reason: string): { value: boolean } | { error: number };
  resolveDispute(caller: string, tradeId: number, favorBuyer: boolean): { value: boolean } | { error: number };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  oracleEnabled: true,
  trades: new Map(),
  disputeVotes: new Map(),
  TRADE_STATE_PENDING: 0,
  TRADE_STATE_DELIVERED: 1,
  TRADE_STATE_SETTLED: 2,
  TRADE_STATE_DISPUTED: 3,
  TRADE_STATE_CANCELLED: 4,
  TRADE_TIMEOUT: 144,
  MIN_TRADE_AMOUNT: 1000n,
  ORACLE_PRINCIPAL: "SP000000000000000000002Q6VF78",
  blockHeight: 1000,
  stxBalance: new Map(),

  isAdmin(caller: string): boolean {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 200 };
    this.paused = pause;
    return { value: pause };
  },

  setOracleEnabled(caller: string, enabled: boolean): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 200 };
    this.oracleEnabled = enabled;
    return { value: enabled };
  },

  createTrade(caller: string, tradeId: number, seller: string, amount: bigint, price: bigint): { value: boolean } | { error: number } {
    if (this.paused) return { error: 104 };
    if (seller === "SP000000000000000000002Q6VF78") return { error: 209 };
    if (this.trades.has(tradeId)) return { error: 202 };
    if (amount < this.MIN_TRADE_AMOUNT) return { error: 205 };
    const buyerBalance = this.stxBalance.get(caller) || 0n;
    if (buyerBalance < price) return { error: 201 };
    this.stxBalance.set(caller, buyerBalance - price);
    this.stxBalance.set("contract", (this.stxBalance.get("contract") || 0n) + price);
    this.trades.set(tradeId, {
      seller,
      buyer: caller,
      amount,
      price,
      escrowFunds: price,
      state: this.TRADE_STATE_PENDING,
      createdAt: this.blockHeight,
      lastUpdated: this.blockHeight,
    });
    return { value: true };
  },

  confirmDelivery(caller: string, tradeId: number): { value: boolean } | { error: number } {
    if (!this.oracleEnabled) return { error: 206 };
    if (caller !== this.ORACLE_PRINCIPAL) return { error: 200 };
    const trade = this.trades.get(tradeId);
    if (!trade) return { error: 202 };
    if (trade.state !== this.TRADE_STATE_PENDING) return { error: 208 };
    this.trades.set(tradeId, { ...trade, state: this.TRADE_STATE_DELIVERED, lastUpdated: this.blockHeight });
    return { value: true };
  },

  settleTrade(caller: string, tradeId: number): { value: boolean } | { error: number } {
    if (this.paused) return { error: 104 };
    const trade = this.trades.get(tradeId);
    if (!trade) return { error: 202 };
    if (caller !== trade.buyer) return { error: 200 };
    if (trade.state !== this.TRADE_STATE_DELIVERED) return { error: 208 };
    this.trades.set(tradeId, { ...trade, state: this.TRADE_STATE_SETTLED, lastUpdated: this.blockHeight });
    this.stxBalance.set(trade.seller, (this.stxBalance.get(trade.seller) || 0n) + trade.escrowFunds);
    this.stxBalance.set("contract", (this.stxBalance.get("contract") || 0n) - trade.escrowFunds);
    return { value: true };
  },

  cancelTrade(caller: string, tradeId: number): { value: boolean } | { error: number } {
    if (this.paused) return { error: 104 };
    const trade = this.trades.get(tradeId);
    if (!trade) return { error: 202 };
    if (caller !== trade.buyer && !this.isAdmin(caller)) return { error: 200 };
    if (trade.state !== this.TRADE_STATE_PENDING) return { error: 208 };
    if (this.blockHeight - trade.createdAt < this.TRADE_TIMEOUT) return { error: 203 };
    this.trades.set(tradeId, { ...trade, state: this.TRADE_STATE_CANCELLED, lastUpdated: this.blockHeight });
    this.stxBalance.set(trade.buyer, (this.stxBalance.get(trade.buyer) || 0n) + trade.escrowFunds);
    this.stxBalance.set("contract", (this.stxBalance.get("contract") || 0n) - trade.escrowFunds);
    return { value: true };
  },

  initiateDispute(caller: string, tradeId: number, reason: string): { value: boolean } | { error: number } {
    if (this.paused) return { error: 104 };
    const trade = this.trades.get(tradeId);
    if (!trade) return { error: 202 };
    if (caller !== trade.buyer) return { error: 200 };
    if (trade.state !== this.TRADE_STATE_PENDING) return { error: 208 };
    this.trades.set(tradeId, { ...trade, state: this.TRADE_STATE_DISPUTED, disputeReason: reason, lastUpdated: this.blockHeight });
    return { value: true };
  },

  resolveDispute(caller: string, tradeId: number, favorBuyer: boolean): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 200 };
    const trade = this.trades.get(tradeId);
    if (!trade) return { error: 202 };
    if (trade.state !== this.TRADE_STATE_DISPUTED) return { error: 208 };
    this.trades.set(tradeId, { ...trade, state: this.TRADE_STATE_SETTLED, lastUpdated: this.blockHeight });
    const recipient = favorBuyer ? trade.buyer : trade.seller;
    this.stxBalance.set(recipient, (this.stxBalance.get(recipient) || 0n) + trade.escrowFunds);
    this.stxBalance.set("contract", (this.stxBalance.get("contract") || 0n) - trade.escrowFunds);
    return { value: true };
  },
};

describe("VoltMesh Settlement and Escrow Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.oracleEnabled = true;
    mockContract.trades = new Map();
    mockContract.disputeVotes = new Map();
    mockContract.blockHeight = 1000;
    mockContract.stxBalance = new Map();
    mockContract.stxBalance.set("contract", 0n);
  });

  it("should create a trade with valid parameters", () => {
    const buyer = "ST2CY5AA2Z7V8VJ1N8Q1AZF4V4F8K5F8Y";
    mockContract.stxBalance.set(buyer, 10000n);
    const result = mockContract.createTrade(buyer, 1, "ST3NBRSFKX28F1H8Y2J68N6B6G8F8Y", 2000n, 5000n);
    expect(result).toEqual({ value: true });
    const trade = mockContract.trades.get(1);
    expect(trade).toEqual({
      seller: "ST3NBRSFKX28F1H8Y2J68N6B6G8F8Y",
      buyer,
      amount: 2000n,
      price: 5000n,
      escrowFunds: 5000n,
      state: mockContract.TRADE_STATE_PENDING,
      createdAt: 1000,
      lastUpdated: 1000,
    });
    expect(mockContract.stxBalance.get(buyer)).toBe(5000n);
    expect(mockContract.stxBalance.get("contract")).toBe(5000n);
  });

  it("should fail to create trade if paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.createTrade("ST2CY5...", 1, "ST3NB...", 2000n, 5000n);
    expect(result).toEqual({ error: 104 });
  });

  it("should confirm delivery by oracle", () => {
    mockContract.stxBalance.set("ST2CY5...", 10000n);
    mockContract.createTrade("ST2CY5...", 1, "ST3NB...", 2000n, 5000n);
    const result = mockContract.confirmDelivery(mockContract.ORACLE_PRINCIPAL, 1);
    expect(result).toEqual({ value: true });
    expect(mockContract.trades.get(1)?.state).toBe(mockContract.TRADE_STATE_DELIVERED);
  });

  it("should settle trade after delivery", () => {
    const buyer = "ST2CY5AA2Z7V8VJ1N8Q1AZF4V4F8K5F8Y";
    const seller = "ST3NBRSFKX28F1H8Y2J68N6B6G8F8Y";
    mockContract.stxBalance.set(buyer, 10000n);
    mockContract.createTrade(buyer, 1, seller, 2000n, 5000n);
    mockContract.confirmDelivery(mockContract.ORACLE_PRINCIPAL, 1);
    const result = mockContract.settleTrade(buyer, 1);
    expect(result).toEqual({ value: true });
    expect(mockContract.trades.get(1)?.state).toBe(mockContract.TRADE_STATE_SETTLED);
    expect(mockContract.stxBalance.get(seller)).toBe(5000n);
    expect(mockContract.stxBalance.get("contract")).toBe(0n);
  });

  it("should cancel trade after timeout", () => {
    const buyer = "ST2CY5AA2Z7V8VJ1N8Q1AZF4V4F8K5F8Y";
    mockContract.stxBalance.set(buyer, 10000n);
    mockContract.createTrade(buyer, 1, "ST3NB...", 2000n, 5000n);
    mockContract.blockHeight += mockContract.TRADE_TIMEOUT;
    const result = mockContract.cancelTrade(buyer, 1);
    expect(result).toEqual({ value: true });
    expect(mockContract.trades.get(1)?.state).toBe(mockContract.TRADE_STATE_CANCELLED);
    expect(mockContract.stxBalance.get(buyer)).toBe(10000n);
    expect(mockContract.stxBalance.get("contract")).toBe(0n);
  });

  it("should initiate dispute by buyer", () => {
    const buyer = "ST2CY5AA2Z7V8VJ1N8Q1AZF4V4F8K5F8Y";
    mockContract.stxBalance.set(buyer, 10000n);
    mockContract.createTrade(buyer, 1, "ST3NB...", 2000n, 5000n);
    const result = mockContract.initiateDispute(buyer, 1, "Non-delivery");
    expect(result).toEqual({ value: true });
    expect(mockContract.trades.get(1)?.state).toBe(mockContract.TRADE_STATE_DISPUTED);
    expect(mockContract.trades.get(1)?.disputeReason).toBe("Non-delivery");
  });

  it("should resolve dispute by admin", () => {
    const buyer = "ST2CY5AA2Z7V8VJ1N8Q1AZF4V4F8K5F8Y";
    const seller = "ST3NBRSFKX28F1H8Y2J68N6B6G8F8Y";
    mockContract.stxBalance.set(buyer, 10000n);
    mockContract.createTrade(buyer, 1, seller, 2000n, 5000n);
    mockContract.initiateDispute(buyer, 1, "Non-delivery");
    const result = mockContract.resolveDispute(mockContract.admin, 1, true);
    expect(result).toEqual({ value: true });
    expect(mockContract.trades.get(1)?.state).toBe(mockContract.TRADE_STATE_SETTLED);
    expect(mockContract.stxBalance.get(buyer)).toBe(10000n);
    expect(mockContract.stxBalance.get("contract")).toBe(0n);
  });

  it("should fail to confirm delivery if oracle disabled", () => {
    mockContract.setOracleEnabled(mockContract.admin, false);
    mockContract.stxBalance.set("ST2CY5...", 10000n);
    mockContract.createTrade("ST2CY5...", 1, "ST3NB...", 2000n, 5000n);
    const result = mockContract.confirmDelivery(mockContract.ORACLE_PRINCIPAL, 1);
    expect(result).toEqual({ error: 206 });
  });
});