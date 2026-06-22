import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Wallet, X, Send, RefreshCw, Copy, ExternalLink,
  AlertTriangle, CheckCircle2, Loader2, ArrowRight,
  Coins, Link, Link2Off, Info, ChevronDown, ChevronUp, ShieldAlert,
} from 'lucide-react';
import {
  hasMetaMask,
  requestAccounts,
  getAccounts,
  getChainId,
  switchToSepolia,
  getMOCKJBalance,
  transferMOCKJ,
  parseMOCKJ,
  formatMOCKJ,
  shortAddress,
  onAccountsChanged,
  onChainChanged,
  SEPOLIA_CHAIN_ID,
  MOCKJ_CONTRACT,
} from '@/lib/mockjToken';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface WalletPanelProps {
  onClose: () => void;
}

type TxStatus = 'idle' | 'pending' | 'success' | 'error';

export default function WalletPanel({ onClose }: WalletPanelProps) {
  // ── Wallet state ────────────────────────────────────────────────────────────
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showFalsePositiveGuide, setShowFalsePositiveGuide] = useState(false);

  // ── Transfer form state ─────────────────────────────────────────────────────
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isOnSepolia = chainId?.toLowerCase() === SEPOLIA_CHAIN_ID.toLowerCase();
  const isConnected = !!account && isOnSepolia;

  // ── Fetch balance ────────────────────────────────────────────────────────────
  const refreshBalance = useCallback(async (addr?: string) => {
    const target = addr ?? account;
    if (!target || !isOnSepolia) return;
    setLoadingBalance(true);
    try {
      const raw = await getMOCKJBalance(target);
      setBalance(raw);
    } catch (err) {
      console.error('[WalletPanel] balance fetch error', err);
    } finally {
      setLoadingBalance(false);
    }
  }, [account, isOnSepolia]);

  // ── Auto-detect existing connection on mount ──────────────────────────────
  useEffect(() => {
    (async () => {
      if (!hasMetaMask()) return;
      const accounts = await getAccounts();
      const chain = await getChainId();
      setChainId(chain);
      if (accounts.length > 0) {
        setAccount(accounts[0]);
      }
    })();

    // Listen for MetaMask events
    const cleanupAccounts = onAccountsChanged((accounts) => {
      if (accounts.length === 0) {
        setAccount(null);
        setBalance(null);
      } else {
        setAccount(accounts[0]);
      }
    });

    const cleanupChain = onChainChanged((id) => {
      setChainId(id);
      // Reload page on chain change (standard MetaMask UX)
      window.location.reload();
    });

    return () => {
      cleanupAccounts();
      cleanupChain();
    };
  }, []);

  // ── Fetch balance when connected & on Sepolia ─────────────────────────────
  useEffect(() => {
    if (isConnected && account) {
      refreshBalance(account);
      // Poll every 15s
      pollRef.current = setInterval(() => refreshBalance(account), 15_000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isConnected, account, refreshBalance]);

  // ── Connect ────────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    if (!hasMetaMask()) {
      toast.error('MetaMask not found. Install MetaMask to continue.');
      window.open('https://metamask.io/download/', '_blank');
      return;
    }
    setConnecting(true);
    try {
      // Switch to Sepolia first
      const chain = await getChainId();
      setChainId(chain);
      if (chain.toLowerCase() !== SEPOLIA_CHAIN_ID.toLowerCase()) {
        await switchToSepolia();
        setChainId(SEPOLIA_CHAIN_ID);
      }
      const accounts = await requestAccounts();
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        toast.success('Wallet connected!');
      }
    } catch (err: unknown) {
      const msg = (err as Error).message ?? 'Connection failed';
      toast.error(msg.includes('rejected') ? 'Connection rejected.' : msg);
    } finally {
      setConnecting(false);
    }
  };

  // ── Add MOCKJ to MetaMask via wallet_watchAsset ────────────────────────────
  const handleWatchAsset = async () => {
    if (!window.ethereum) return;
    try {
      const added = await window.ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: MOCKJ_CONTRACT,
            symbol: 'MOCKJ',
            decimals: 18,
            // Public token logo hosted on Etherscan CDN pattern
            image: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${MOCKJ_CONTRACT}/logo.png`,
          },
        } as unknown as unknown[],
      });
      if (added) {
        toast.success('MOCKJ added to MetaMask!');
      } else {
        toast('Token addition was dismissed.');
      }
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to add token');
    }
  };

  // ── Disconnect (MetaMask doesn't have a programmatic disconnect, we just clear state) ──
  const handleDisconnect = () => {
    setAccount(null);
    setBalance(null);
    setTxStatus('idle');
    setTxHash(null);
    toast('Wallet disconnected from site.');
  };

  // ── Copy address ──────────────────────────────────────────────────────────
  const copyAddress = () => {
    if (!account) return;
    navigator.clipboard.writeText(account);
    toast.success('Address copied!');
  };

  // ── Transfer ──────────────────────────────────────────────────────────────
  const handleTransfer = async () => {
    if (!account) return;
    setTxError(null);

    // Validation
    if (!toAddress.match(/^0x[0-9a-fA-F]{40}$/)) {
      setTxError('Invalid recipient address (must be a valid 0x… Ethereum address).');
      return;
    }
    if (toAddress.toLowerCase() === account.toLowerCase()) {
      setTxError("You can't send tokens to your own address.");
      return;
    }
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setTxError('Enter a valid amount greater than 0.');
      return;
    }

    let raw: bigint;
    try {
      raw = parseMOCKJ(amount);
    } catch {
      setTxError('Invalid amount format.');
      return;
    }

    if (balance !== null && raw > balance) {
      setTxError(`Insufficient balance. You have ${formatMOCKJ(balance)} MOCKJ.`);
      return;
    }

    setTxStatus('pending');
    try {
      const hash = await transferMOCKJ(account, toAddress, raw);
      setTxHash(hash);
      setTxStatus('success');
      setToAddress('');
      setAmount('');
      toast.success('Transfer submitted!');
      // Refresh balance after a short delay
      setTimeout(() => refreshBalance(account), 3000);
    } catch (err: unknown) {
      const msg = (err as Error).message ?? 'Transaction failed';
      setTxStatus('error');
      setTxError(
        msg.includes('rejected') || msg.includes('denied')
          ? 'Transaction rejected by user.'
          : msg.slice(0, 120)
      );
    }
  };

  const resetTx = () => {
    setTxStatus('idle');
    setTxHash(null);
    setTxError(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm h-auto max-h-[92vh] flex flex-col bg-[hsl(224_20%_7%)] border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background: 'hsl(38 95% 60% / 0.12)',
                border: '1px solid hsl(38 95% 60% / 0.35)',
              }}
            >
              <Coins className="w-4.5 h-4.5" style={{ color: 'hsl(38 95% 60%)' }} />
            </div>
            <div>
              <h2
                className="text-sm font-bold text-foreground leading-none"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                MOCKJ Wallet
              </h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Ethereum Sepolia Testnet
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground border border-border hover:border-[hsl(38_95%_60%_/_0.4)] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Not connected ────────────────────────────────────────────────── */}
          {!isConnected && (
            <div className="p-6 flex flex-col items-center gap-5">
              {/* MetaMask check */}
              {!hasMetaMask() && (
                <div className="w-full flex items-start gap-3 p-4 rounded-xl bg-[hsl(38_95%_60%_/_0.08)] border border-[hsl(38_95%_60%_/_0.25)]">
                  <AlertTriangle className="w-4 h-4 text-[hsl(38_95%_60%)] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-[hsl(38_95%_60%)]">MetaMask Required</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Install MetaMask browser extension to use the MOCKJ wallet.
                    </p>
                    <a
                      href="https://metamask.io/download/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[hsl(191_97%_55%)] underline mt-1 inline-block hover:opacity-80"
                    >
                      Download MetaMask →
                    </a>
                  </div>
                </div>
              )}

              {/* Wrong network */}
              {account && !isOnSepolia && (
                <div className="w-full flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-destructive">Wrong Network</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Switch to Ethereum Sepolia to use MOCKJ.
                    </p>
                    <button
                      onClick={async () => {
                        try {
                          await switchToSepolia();
                          setChainId(SEPOLIA_CHAIN_ID);
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                      className="text-[11px] text-[hsl(191_97%_55%)] underline mt-1 hover:opacity-80"
                    >
                      Switch to Sepolia →
                    </button>
                  </div>
                </div>
              )}

              {/* Token info */}
              <div className="w-full p-4 rounded-xl bg-[hsl(224_20%_10%)] border border-border space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Token Info</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <span className="text-muted-foreground">Name</span>
                  <span className="text-foreground font-medium">MockJ Token</span>
                  <span className="text-muted-foreground">Symbol</span>
                  <span className="font-bold" style={{ color: 'hsl(38 95% 60%)' }}>MOCKJ</span>
                  <span className="text-muted-foreground">Network</span>
                  <span className="text-foreground">Ethereum Sepolia</span>
                  <span className="text-muted-foreground">Contract</span>
                  <a
                    href={`https://sepolia.etherscan.io/address/${MOCKJ_CONTRACT}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[hsl(191_97%_55%)] hover:opacity-80 truncate"
                  >
                    {shortAddress(MOCKJ_CONTRACT)}
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </a>
                </div>
              </div>

              {/* Preview URL phishing warning info banner */}
              <div className="w-full flex items-start gap-3 p-3.5 rounded-xl bg-[hsl(191_97%_55%_/_0.07)] border border-[hsl(191_97%_55%_/_0.25)]">
                <Info className="w-3.5 h-3.5 text-[hsl(191_97%_55%)] shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  If you see a MetaMask <strong className="text-foreground">"Malicious site"</strong> warning on preview URLs,{' '}
                  <strong className="text-[hsl(191_97%_55%)]">
                    click "Connect Anyway"</strong> — this is your own MockJ app, not a threat.
                </p>
              </div>

              {/* Connect button */}
              <button
                onClick={handleConnect}
                disabled={connecting || !hasMetaMask()}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, hsl(38 95% 60%), hsl(38 95% 45%))',
                  color: 'hsl(224 20% 6%)',
                  boxShadow: '0 4px 24px hsl(38 95% 60% / 0.35)',
                }}
              >
                {connecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Link className="w-4 h-4" />
                )}
                {connecting ? 'Connecting…' : 'Connect MetaMask'}
              </button>

              <p className="text-[10px] text-muted-foreground/60 text-center">
                Sepolia testnet only · ETH not required to view balance
              </p>

              {/* False positive guide — collapsible */}
              <div className="w-full rounded-xl border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowFalsePositiveGuide(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-[hsl(224_15%_10%)] transition-all"
                >
                  <span className="flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-[hsl(38_95%_60%)]" />
                    Getting flagged on your live domain?
                  </span>
                  {showFalsePositiveGuide
                    ? <ChevronUp className="w-3.5 h-3.5" />
                    : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showFalsePositiveGuide && (
                  <div className="px-4 pb-4 pt-1 border-t border-border space-y-3 bg-[hsl(224_15%_8%)]">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      MetaMask uses a community blocklist called{' '}
                      <strong className="text-foreground">eth-phishing-detect</strong>. Preview URLs
                      are sometimes flagged as false positives. Here's how to fix it:
                    </p>
                    <ol className="text-[11px] text-muted-foreground space-y-2 list-none">
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-[hsl(191_97%_55%_/_0.15)] border border-[hsl(191_97%_55%_/_0.4)] flex items-center justify-center text-[9px] font-bold text-[hsl(191_97%_55%)] shrink-0 mt-0.5">1</span>
                        <span>Publish your site to your <strong className="text-foreground">.onspace.app</strong> or custom domain first.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-[hsl(191_97%_55%_/_0.15)] border border-[hsl(191_97%_55%_/_0.4)] flex items-center justify-center text-[9px] font-bold text-[hsl(191_97%_55%)] shrink-0 mt-0.5">2</span>
                        <span>Open a new GitHub issue in the <strong className="text-foreground">eth-phishing-detect</strong> repo to request allowlisting.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-[hsl(191_97%_55%_/_0.15)] border border-[hsl(191_97%_55%_/_0.4)] flex items-center justify-center text-[9px] font-bold text-[hsl(191_97%_55%)] shrink-0 mt-0.5">3</span>
                        <span>Most false positives are resolved within <strong className="text-foreground">24–48 hours</strong>.</span>
                      </li>
                    </ol>
                    <a
                      href="https://github.com/MetaMask/eth-phishing-detect"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl border border-[hsl(191_97%_55%_/_0.35)] bg-[hsl(191_97%_55%_/_0.07)] text-[11px] font-semibold text-[hsl(191_97%_55%)] hover:bg-[hsl(191_97%_55%_/_0.13)] transition-all group/link"
                    >
                      <span className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.298 24 12c0-6.627-5.373-12-12-12z"/>
                        </svg>
                        MetaMask / eth-phishing-detect
                      </span>
                      <ExternalLink className="w-3 h-3 opacity-60 group-hover/link:opacity-100 transition-opacity" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Connected ────────────────────────────────────────────────────── */}
          {isConnected && (
            <div className="p-5 space-y-4">
              {/* Wallet address card */}
              <div
                className="rounded-xl p-4 border"
                style={{
                  background: 'hsl(224 20% 10%)',
                  borderColor: 'hsl(38 95% 60% / 0.25)',
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Connected Wallet
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[hsl(142_70%_55%)] animate-pulse" />
                    <span className="text-[10px] text-[hsl(142_70%_55%)] font-medium">Sepolia</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <code
                    className="flex-1 text-xs text-foreground font-mono truncate"
                    title={account}
                  >
                    {account}
                  </code>
                  <button
                    onClick={copyAddress}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-[hsl(191_97%_55%)] hover:border-[hsl(191_97%_55%_/_0.4)] transition-all shrink-0"
                    title="Copy address"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <a
                    href={`https://sepolia.etherscan.io/address/${account}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-[hsl(191_97%_55%)] hover:border-[hsl(191_97%_55%_/_0.4)] transition-all shrink-0"
                    title="View on Etherscan"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    onClick={handleDisconnect}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-all shrink-0"
                    title="Disconnect wallet"
                  >
                    <Link2Off className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* MOCKJ Balance card */}
              <div
                className="rounded-xl p-5 border text-center relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, hsl(38 95% 60% / 0.1), hsl(265 80% 65% / 0.06))',
                  borderColor: 'hsl(38 95% 60% / 0.3)',
                }}
              >
                {/* Glow */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle at 50% 0%, hsl(38 95% 60% / 0.08) 0%, transparent 70%)',
                  }}
                />
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 relative">
                  MOCKJ Balance
                </p>
                <div className="flex items-center justify-center gap-2 relative">
                  {loadingBalance ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  ) : (
                    <p
                      className="text-3xl font-black"
                      style={{
                        fontFamily: 'Space Grotesk, sans-serif',
                        color: 'hsl(38 95% 60%)',
                        textShadow: '0 0 24px hsl(38 95% 60% / 0.4)',
                      }}
                    >
                      {balance !== null ? formatMOCKJ(balance) : '—'}
                    </p>
                  )}
                  <span
                    className="text-base font-bold self-end pb-1"
                    style={{ color: 'hsl(38 95% 60% / 0.7)' }}
                  >
                    MOCKJ
                  </span>
                </div>
                <button
                  onClick={() => refreshBalance()}
                  disabled={loadingBalance}
                  className="mt-3 flex items-center gap-1 mx-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 relative"
                >
                  <RefreshCw className={cn('w-3 h-3', loadingBalance && 'animate-spin')} />
                  Refresh balance
                </button>
              </div>

              {/* ── Transfer Form ────────────────────────────────────────────── */}
              <div className="rounded-xl border border-border bg-[hsl(224_20%_9%)] overflow-hidden">
                <div className="px-4 pt-4 pb-3 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <Send className="w-3.5 h-3.5 text-[hsl(191_97%_55%)]" />
                    <h3
                      className="text-xs font-bold text-foreground"
                      style={{ fontFamily: 'Space Grotesk, sans-serif' }}
                    >
                      Transfer MOCKJ
                    </h3>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {/* Success state */}
                  {txStatus === 'success' && txHash && (
                    <div className="flex flex-col gap-3 items-center py-2">
                      <div className="w-12 h-12 rounded-full bg-[hsl(142_70%_50%_/_0.12)] border border-[hsl(142_70%_50%_/_0.35)] flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-[hsl(142_70%_50%)]" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-foreground">Transfer Submitted!</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Your transaction is being confirmed on Sepolia.
                        </p>
                      </div>
                      <a
                        href={`https://sepolia.etherscan.io/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-[hsl(191_97%_55%)] hover:opacity-80 transition-opacity"
                      >
                        View on Etherscan
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        onClick={resetTx}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        New transfer
                      </button>
                    </div>
                  )}

                  {/* Form */}
                  {txStatus !== 'success' && (
                    <>
                      {/* To address */}
                      <div>
                        <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Recipient Address
                        </label>
                        <input
                          type="text"
                          value={toAddress}
                          onChange={e => { setToAddress(e.target.value); setTxError(null); }}
                          placeholder="0x…"
                          className="w-full bg-[hsl(224_15%_11%)] border border-border rounded-xl px-3 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[hsl(191_97%_55%_/_0.5)] transition-colors"
                          disabled={txStatus === 'pending'}
                        />
                      </div>

                      {/* Amount */}
                      <div>
                        <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Amount (MOCKJ)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={amount}
                            onChange={e => { setAmount(e.target.value); setTxError(null); }}
                            placeholder="0.00"
                            min="0"
                            step="any"
                            className="w-full bg-[hsl(224_15%_11%)] border border-border rounded-xl px-3 py-2.5 pr-16 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[hsl(38_95%_60%_/_0.5)] transition-colors"
                            disabled={txStatus === 'pending'}
                          />
                          <button
                            onClick={() => {
                              if (balance !== null) {
                                // Set max (leave tiny amount for gas — not needed for ERC20 transfer but good UX)
                                setAmount(formatMOCKJ(balance).replace(/,/g, ''));
                              }
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded-md transition-all"
                            style={{
                              background: 'hsl(38 95% 60% / 0.15)',
                              color: 'hsl(38 95% 60%)',
                            }}
                            disabled={txStatus === 'pending'}
                          >
                            MAX
                          </button>
                        </div>
                        {balance !== null && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Available: <span style={{ color: 'hsl(38 95% 60%)' }}>{formatMOCKJ(balance)} MOCKJ</span>
                          </p>
                        )}
                      </div>

                      {/* Error */}
                      {txError && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/8 border border-destructive/25">
                          <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                          <p className="text-xs text-destructive/90">{txError}</p>
                        </div>
                      )}

                      {/* Send button */}
                      <button
                        onClick={handleTransfer}
                        disabled={txStatus === 'pending' || !toAddress || !amount}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed mt-1"
                        style={{
                          background: txStatus === 'pending'
                            ? 'hsl(191 97% 55% / 0.2)'
                            : 'linear-gradient(135deg, hsl(191 97% 55%), hsl(191 97% 40%))',
                          color: txStatus === 'pending' ? 'hsl(191 97% 55%)' : 'hsl(224 20% 6%)',
                          boxShadow: txStatus !== 'pending' ? '0 4px 20px hsl(191 97% 55% / 0.3)' : 'none',
                          border: txStatus === 'pending' ? '1px solid hsl(191 97% 55% / 0.4)' : 'none',
                        }}
                      >
                        {txStatus === 'pending' ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Sending…
                          </>
                        ) : (
                          <>
                            <ArrowRight className="w-4 h-4" />
                            Send MOCKJ
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Add MOCKJ to MetaMask */}
              <button
                onClick={handleWatchAsset}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 hover:scale-[1.01]"
                style={{
                  borderColor: 'hsl(38 95% 60% / 0.4)',
                  color: 'hsl(38 95% 60%)',
                  background: 'hsl(38 95% 60% / 0.07)',
                }}
              >
                <Coins className="w-3.5 h-3.5" />
                Add MOCKJ to MetaMask
              </button>

              {/* Contract link */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] text-muted-foreground/50">
                  Contract: {shortAddress(MOCKJ_CONTRACT)}
                </span>
                <a
                  href={`https://sepolia.etherscan.io/address/${MOCKJ_CONTRACT}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[hsl(191_97%_55%)] flex items-center gap-1 hover:opacity-80"
                >
                  Etherscan <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>

              <p className="text-[10px] text-muted-foreground/40 text-center pb-1">
                Sepolia testnet only · MOCKJ has no real monetary value
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
