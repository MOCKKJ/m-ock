/**
 * MockJ Token (MOCKJ) — Ethereum Sepolia ERC20 integration
 * Contract: 0xfba0B79aDd85D41A73a639a42E7D8d50b94aa705
 * Network:  Ethereum Sepolia (chainId 11155111)
 *
 * Public surface: connect, disconnect, getBalance, transfer
 * Admin surface: mint — accessible only via /admin/mint route with owner check
 * Hidden: transferOwnership, renounceOwnership (intentionally absent)
 */

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

export const MOCKJ_CONTRACT = '0xfba0B79aDd85D41A73a639a42E7D8d50b94aa705';
export const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111 decimal

// Minimal ERC20 ABI — only what the public UI needs (NO mint/admin functions)
export const MOCKJ_ABI = [
  // Read
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  // Write
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  // Events
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse a BigInt hex string from eth_call into a decimal JS BigInt */
function hexToBigInt(hex: string): bigint {
  return hex ? BigInt(hex) : 0n;
}

/** Format a raw uint256 token amount (18 decimals) to a readable string */
export function formatMOCKJ(raw: bigint, decimals = 18): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 4);
  return `${whole.toLocaleString()}.${fracStr}`;
}

/** Convert a decimal string amount to raw uint256 (18 decimals) */
export function parseMOCKJ(amount: string, decimals = 18): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
}

/** Shorten an address for display */
export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Wallet helpers ────────────────────────────────────────────────────────────

export function hasMetaMask(): boolean {
  return typeof window.ethereum !== 'undefined' && !!window.ethereum.isMetaMask;
}

export async function requestAccounts(): Promise<string[]> {
  if (!window.ethereum) throw new Error('MetaMask not found. Please install MetaMask.');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
  return accounts;
}

export async function getAccounts(): Promise<string[]> {
  if (!window.ethereum) return [];
  const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as string[];
  return accounts;
}

export async function getChainId(): Promise<string> {
  if (!window.ethereum) return '0x0';
  const chainId = await window.ethereum.request({ method: 'eth_chainId' }) as string;
  return chainId;
}

export async function switchToSepolia(): Promise<void> {
  if (!window.ethereum) throw new Error('MetaMask not found');
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
  } catch (err: unknown) {
    // Chain not added yet — add it
    if ((err as { code?: number }).code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: SEPOLIA_CHAIN_ID,
          chainName: 'Sepolia Testnet',
          nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://rpc.sepolia.org', 'https://sepolia.infura.io/v3/'],
          blockExplorerUrls: ['https://sepolia.etherscan.io'],
        }],
      });
    } else {
      throw err;
    }
  }
}

// ── Contract reads (raw JSON-RPC, no ethers dependency) ───────────────────────

async function callContract(selector: string, params = '0'.repeat(64)): Promise<string> {
  const data = selector + params;
  const result = await window.ethereum!.request({
    method: 'eth_call',
    params: [{ to: MOCKJ_CONTRACT, data }, 'latest'],
  }) as string;
  return result;
}

// keccak256 selectors
const SEL_BALANCE_OF  = '0x70a08231'; // balanceOf(address)
const SEL_DECIMALS    = '0x313ce567'; // decimals()
const SEL_TOTAL_SUPPLY = '0x18160ddd'; // totalSupply()
const SEL_OWNER       = '0x8da5cb5b'; // owner()

export async function getTokenDecimals(): Promise<number> {
  const res = await callContract(SEL_DECIMALS);
  return Number(hexToBigInt(res));
}

export async function getMOCKJBalance(address: string): Promise<bigint> {
  const paddedAddr = address.replace('0x', '').padStart(64, '0');
  const res = await callContract(SEL_BALANCE_OF, paddedAddr);
  return hexToBigInt(res);
}

export async function getTotalSupply(): Promise<bigint> {
  const res = await callContract(SEL_TOTAL_SUPPLY);
  return hexToBigInt(res);
}

/** Returns the contract owner address (lowercased) */
export async function getOwner(): Promise<string> {
  const res = await callContract(SEL_OWNER);
  // result is 32 bytes; address occupies last 20 bytes
  return ('0x' + res.slice(-40)).toLowerCase();
}

// ── Contract writes (eth_sendTransaction) ─────────────────────────────────────

const SEL_TRANSFER = '0xa9059cbb'; // transfer(address,uint256)
const SEL_MINT     = '0x40c10f19'; // mint(address,uint256)

export async function transferMOCKJ(
  fromAddress: string,
  toAddress: string,
  amount: bigint
): Promise<string> {
  if (!window.ethereum) throw new Error('MetaMask not found');

  // Encode: transfer(address to, uint256 amount)
  const paddedTo = toAddress.replace('0x', '').padStart(64, '0');
  const paddedAmt = amount.toString(16).padStart(64, '0');
  const data = SEL_TRANSFER + paddedTo + paddedAmt;

  const txHash = await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [{
      from: fromAddress,
      to: MOCKJ_CONTRACT,
      data,
      chainId: SEPOLIA_CHAIN_ID,
    }],
  }) as string;

  return txHash;
}

/**
 * Mint MOCKJ tokens — admin only, verified by owner check before calling.
 * This function is intentionally NOT exported from WalletPanel or any public UI.
 */
export async function mintMOCKJ(
  fromAddress: string,
  toAddress: string,
  amount: bigint
): Promise<string> {
  if (!window.ethereum) throw new Error('MetaMask not found');

  const paddedTo  = toAddress.replace('0x', '').padStart(64, '0');
  const paddedAmt = amount.toString(16).padStart(64, '0');
  const data = SEL_MINT + paddedTo + paddedAmt;

  const txHash = await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [{ from: fromAddress, to: MOCKJ_CONTRACT, data, chainId: SEPOLIA_CHAIN_ID }],
  }) as string;

  return txHash;
}

// ── Event subscription helpers ────────────────────────────────────────────────

export function onAccountsChanged(handler: (accounts: string[]) => void): () => void {
  if (!window.ethereum) return () => {};
  const wrapper = (...args: unknown[]) => handler(args[0] as string[]);
  window.ethereum.on('accountsChanged', wrapper);
  return () => window.ethereum?.removeListener('accountsChanged', wrapper);
}

export function onChainChanged(handler: (chainId: string) => void): () => void {
  if (!window.ethereum) return () => {};
  const wrapper = (...args: unknown[]) => handler(args[0] as string);
  window.ethereum.on('chainChanged', wrapper);
  return () => window.ethereum?.removeListener('chainChanged', wrapper);
}
