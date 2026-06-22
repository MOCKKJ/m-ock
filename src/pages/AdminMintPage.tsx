/**
 * /admin/mint — Private admin-only minting interface for MOCKJ token.
 *
 * Access control:
 *  1. User must have MetaMask connected on Sepolia.
 *  2. Connected wallet must match the contract owner address (verified via eth_call).
 *
 * This page is intentionally unlisted — no nav link, no sitemap entry.
 * The mint function selector is ONLY present in this file, never in WalletPanel.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Coins, ShieldAlert, Loader2, ArrowLeft, CheckCircle2,
  ExternalLink, AlertTriangle, RefreshCw, Send,
} from 'lucide-react';
import {
  hasMetaMask, requestAccounts, getAccounts, getChainId,
  switchToSepolia, getOwner, mintMOCKJ, parseMOCKJ, formatMOCKJ,
  getMOCKJBalance, onAccountsChanged, onChainChanged,
  SEPOLIA_CHAIN_ID, MOCKJ_CONTRACT, shortAddress,
} from '@/lib/mockjToken';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type AccessState = 'checking' | 'no-metamask' | 'disconnected' | 'wrong-network' | 'not-owner' | 'authorized';
type TxStatus    = 'idle' | 'pending' | 'success' | 'error';

export default function AdminMintPage() {
  const navigate = useNavigate();

  // ── Wallet state ─────────────────────────────────────────────────────────────
  const [account,  setAccount]  = useState<string | null>(null);
  const [chainId,  setChainId]  = useState<string | null>(null);
  const [owner,    setOwner]    = useState<string | null>(null);
  const [balance,  setBalance]  = useState<bigint | null>(null);
  const [access,   setAccess]   = useState<AccessState>('checking');
  const [connecting, setConnecting] = useState(false);

  // ── Form state ───────────────────────────────────────────────────────────────
  const [toAddress, setToAddress] = useState('');
  const [amount,    setAmount]    = useState('');
  const [txStatus,  setTxStatus]  = useState<TxStatus>('idle');
  const [txHash,    setTxHash]    = useState<string | null>(null);
  const [txError,   setTxError]   = useState<string | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const isOnSepolia = chainId?.toLowerCase() === SEPOLIA_CHAIN_ID.toLowerCase();

  const evaluate = useCallback((acct: string | null, chain: string | null, ownerAddr: string | null) => {
    if (!hasMetaMask())              { setAccess('no-metamask');    return; }
    if (!acct)                       { setAccess('disconnected');   return; }
    if (!chain || chain.toLowerCase() !== SEPOLIA_CHAIN_ID.toLowerCase()) {
      setAccess('wrong-network'); return;
    }
    if (!ownerAddr)                  { setAccess('checking');       return; }
    if (acct.toLowerCase() !== ownerAddr.toLowerCase()) {
      setAccess('not-owner'); return;
    }
    setAccess('authorized');
  }, []);

  // ── Bootstrap ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!hasMetaMask()) { setAccess('no-metamask'); return; }

      const [accounts, chain] = await Promise.all([getAccounts(), getChainId()]);
      setChainId(chain);

      const acct = accounts[0] ?? null;
      setAccount(acct);

      if (acct && chain.toLowerCase() === SEPOLIA_CHAIN_ID.toLowerCase()) {
        try {
          const ownerAddr = await getOwner();
          setOwner(ownerAddr);
          evaluate(acct, chain, ownerAddr);
        } catch {
          evaluate(acct, chain, null);
        }
      } else {
        evaluate(acct, chain, null);
      }
    })();

    const cleanAccounts = onAccountsChanged(async (accounts) => {
      const acct = accounts[0] ?? null;
      setAccount(acct);
      if (acct) {
        const ownerAddr = await getOwner().catch(() => null);
        setOwner(ownerAddr);
        setChainId(prev => { evaluate(acct, prev, ownerAddr); return prev; });
      } else {
        setAccess('disconnected');
      }
    });

    const cleanChain = onChainChanged((id) => {
      setChainId(id);
      window.location.reload();
    });

    return () => { cleanAccounts(); cleanChain(); };
  }, [evaluate]);

  // Refresh balance when authorized
  useEffect(() => {
    if (access === 'authorized' && account && isOnSepolia) {
      getMOCKJBalance(account).then(setBalance).catch(console.error);
    }
  }, [access, account, isOnSepolia]);

  // ── Connect ───────────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const chain = await getChainId();
      if (chain.toLowerCase() !== SEPOLIA_CHAIN_ID.toLowerCase()) await switchToSepolia();
      const accounts = await requestAccounts();
      const acct = accounts[0];
      if (!acct) throw new Error('No account returned');
      const chain2 = await getChainId();
      setChainId(chain2);
      setAccount(acct);
      const ownerAddr = await getOwner();
      setOwner(ownerAddr);
      evaluate(acct, chain2, ownerAddr);
    } catch (err) {
      toast.error((err as Error).message ?? 'Connection failed');
      setAccess('disconnected');
    } finally {
      setConnecting(false);
    }
  };

  // ── Mint ──────────────────────────────────────────────────────────────────────
  const handleMint = async () => {
    if (!account || access !== 'authorized') return;
    setTxError(null);

    if (!toAddress.match(/^0x[0-9a-fA-F]{40}$/)) {
      setTxError('Invalid recipient address.'); return;
    }
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) {
      setTxError('Enter a valid positive amount.'); return;
    }

    let raw: bigint;
    try { raw = parseMOCKJ(amount); }
    catch { setTxError('Invalid amount format.'); return; }

    setTxStatus('pending');
    try {
      const hash = await mintMOCKJ(account, toAddress, raw);
      setTxHash(hash);
      setTxStatus('success');
      setToAddress('');
      setAmount('');
      toast.success('Mint transaction submitted!');
      setTimeout(() => getMOCKJBalance(account).then(setBalance).catch(() => {}), 4000);
    } catch (err: unknown) {
      const msg = (err as Error).message ?? 'Transaction failed';
      setTxStatus('error');
      setTxError(msg.includes('rejected') || msg.includes('denied') ? 'Transaction rejected.' : msg.slice(0, 140));
    }
  };

  const resetTx = () => { setTxStatus('idle'); setTxHash(null); setTxError(null); };

  // ── Access State Cards ────────────────────────────────────────────────────────
  const renderAccess = () => {
    if (access === 'checking') {
      return (
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Verifying ownership…</p>
        </div>
      );
    }

    if (access === 'no-metamask') {
      return (
        <div className="text-center py-12 max-w-xs mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-[hsl(38_95%_60%_/_0.12)] border border-[hsl(38_95%_60%_/_0.3)] flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-[hsl(38_95%_60%)]" />
          </div>
          <h2 className="text-base font-bold text-foreground mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>MetaMask Required</h2>
          <p className="text-sm text-muted-foreground mb-5">Install MetaMask to access the admin mint interface.</p>
          <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer"
            className="text-sm text-[hsl(191_97%_55%)] underline hover:opacity-80">
            Download MetaMask →
          </a>
        </div>
      );
    }

    if (access === 'disconnected') {
      return (
        <div className="text-center py-12 max-w-xs mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-[hsl(191_97%_55%_/_0.12)] border border-[hsl(191_97%_55%_/_0.3)] flex items-center justify-center mx-auto mb-4">
            <Coins className="w-7 h-7 text-[hsl(191_97%_55%)]" />
          </div>
          <h2 className="text-base font-bold text-foreground mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Connect Wallet</h2>
          <p className="text-sm text-muted-foreground mb-5">Connect your owner wallet on Sepolia to continue.</p>
          <button onClick={handleConnect} disabled={connecting}
            className="flex items-center gap-2 mx-auto px-5 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, hsl(191 97% 55%), hsl(191 97% 40%))', color: 'hsl(224 20% 6%)' }}>
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
            {connecting ? 'Connecting…' : 'Connect MetaMask'}
          </button>
        </div>
      );
    }

    if (access === 'wrong-network') {
      return (
        <div className="text-center py-12 max-w-xs mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="text-base font-bold text-foreground mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Wrong Network</h2>
          <p className="text-sm text-muted-foreground mb-5">Switch to Ethereum Sepolia testnet.</p>
          <button onClick={async () => { await switchToSepolia(); window.location.reload(); }}
            className="text-sm text-[hsl(191_97%_55%)] underline hover:opacity-80">
            Switch to Sepolia →
          </button>
        </div>
      );
    }

    if (access === 'not-owner') {
      return (
        <div className="text-center py-12 max-w-sm mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="text-base font-bold text-foreground mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Access Denied</h2>
          <p className="text-sm text-muted-foreground mb-2">
            Connected wallet is not the contract owner.
          </p>
          <div className="text-xs text-muted-foreground/60 space-y-1 mt-4 p-3 rounded-xl bg-[hsl(224_15%_10%)] border border-border">
            <p>Your wallet: <code className="text-foreground font-mono">{account ? shortAddress(account) : '—'}</code></p>
            <p>Contract owner: <code className="text-foreground font-mono">{owner ? shortAddress(owner) : '—'}</code></p>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-[hsl(224_20%_6%)] text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[hsl(224_20%_7%)] border-b border-border px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground border border-border hover:border-[hsl(191_97%_55%_/_0.4)] transition-all">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-foreground flex items-center gap-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                <Coins className="w-4 h-4 text-[hsl(38_95%_60%)]" />
                MOCKJ Admin Mint
              </h1>
              <p className="text-[10px] text-muted-foreground">Private · Owner access only · Sepolia</p>
            </div>
          </div>
          {access === 'authorized' && (
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(142_70%_55%)] animate-pulse" />
              <span className="text-[10px] text-[hsl(142_70%_55%)] font-semibold">Owner</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-6 py-10">
        {access !== 'authorized' ? (
          renderAccess()
        ) : (
          <div className="space-y-5">
            {/* Owner info card */}
            <div className="rounded-2xl border p-5 space-y-3"
              style={{ background: 'hsl(224 20% 9%)', borderColor: 'hsl(142 70% 50% / 0.3)' }}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Connected Owner Wallet</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(142_70%_55%)] animate-pulse" />
                  <span className="text-[10px] text-[hsl(142_70%_55%)] font-medium">Sepolia</span>
                </div>
              </div>
              <code className="text-xs font-mono text-foreground break-all">{account}</code>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-muted-foreground">Your MOCKJ balance:</span>
                <span className="font-bold" style={{ color: 'hsl(38 95% 60%)' }}>
                  {balance !== null ? `${formatMOCKJ(balance)} MOCKJ` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Contract:</span>
                <a href={`https://sepolia.etherscan.io/address/${MOCKJ_CONTRACT}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[hsl(191_97%_55%)] hover:opacity-80">
                  {shortAddress(MOCKJ_CONTRACT)} <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>

            {/* Warning banner */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[hsl(38_95%_60%_/_0.07)] border border-[hsl(38_95%_60%_/_0.25)]">
              <AlertTriangle className="w-4 h-4 text-[hsl(38_95%_60%)] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-[hsl(38_95%_60%)]">Admin Action</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Minting creates new MOCKJ tokens. Verify recipient address carefully — this is irreversible on-chain.
                </p>
              </div>
            </div>

            {/* Mint Form */}
            <div className="rounded-2xl border border-border bg-[hsl(224_20%_9%)] overflow-hidden">
              <div className="px-5 pt-5 pb-4 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <Send className="w-3.5 h-3.5 text-[hsl(38_95%_60%)]" />
                  <h2 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                    Mint MOCKJ Tokens
                  </h2>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Success */}
                {txStatus === 'success' && txHash && (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-[hsl(142_70%_50%_/_0.12)] border border-[hsl(142_70%_50%_/_0.35)] flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-[hsl(142_70%_50%)]" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">Mint Submitted!</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Confirming on Sepolia…</p>
                    </div>
                    <a href={`https://sepolia.etherscan.io/tx/${txHash}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-[hsl(191_97%_55%)] hover:opacity-80">
                      View on Etherscan <ExternalLink className="w-3 h-3" />
                    </a>
                    <button onClick={resetTx} className="text-xs text-muted-foreground hover:text-foreground underline">
                      Mint again
                    </button>
                  </div>
                )}

                {txStatus !== 'success' && (
                  <>
                    {/* Recipient */}
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        Recipient Address
                      </label>
                      <input type="text" value={toAddress}
                        onChange={e => { setToAddress(e.target.value); setTxError(null); }}
                        placeholder="0x…"
                        className="w-full bg-[hsl(224_15%_11%)] border border-border rounded-xl px-3 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[hsl(38_95%_60%_/_0.5)] transition-colors"
                        disabled={txStatus === 'pending'}
                      />
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        Amount to Mint (MOCKJ)
                      </label>
                      <input type="number" value={amount} min="0" step="any"
                        onChange={e => { setAmount(e.target.value); setTxError(null); }}
                        placeholder="0.00"
                        className="w-full bg-[hsl(224_15%_11%)] border border-border rounded-xl px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-[hsl(38_95%_60%_/_0.5)] transition-colors"
                        disabled={txStatus === 'pending'}
                      />
                    </div>

                    {/* Error */}
                    {txError && (
                      <div className={cn(
                        'flex items-start gap-2 p-3 rounded-xl border',
                        txStatus === 'error'
                          ? 'bg-destructive/8 border-destructive/25'
                          : 'bg-[hsl(38_95%_60%_/_0.08)] border-[hsl(38_95%_60%_/_0.3)]'
                      )}>
                        <AlertTriangle className={cn('w-3.5 h-3.5 shrink-0 mt-0.5', txStatus === 'error' ? 'text-destructive' : 'text-[hsl(38_95%_60%)]')} />
                        <p className={cn('text-xs', txStatus === 'error' ? 'text-destructive/90' : 'text-[hsl(38_95%_60%)]')}>{txError}</p>
                      </div>
                    )}

                    {/* Mint button */}
                    <button onClick={handleMint}
                      disabled={txStatus === 'pending' || !toAddress || !amount}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: txStatus === 'pending'
                          ? 'hsl(38 95% 60% / 0.2)'
                          : 'linear-gradient(135deg, hsl(38 95% 60%), hsl(38 95% 42%))',
                        color: txStatus === 'pending' ? 'hsl(38 95% 60%)' : 'hsl(224 20% 6%)',
                        boxShadow: txStatus !== 'pending' ? '0 4px 24px hsl(38 95% 60% / 0.4)' : 'none',
                        fontFamily: 'Space Grotesk, sans-serif',
                      }}>
                      {txStatus === 'pending'
                        ? <><Loader2 className="w-4 h-4 animate-spin" />Minting…</>
                        : <><Coins className="w-4 h-4" />Mint MOCKJ</>
                      }
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 pb-4">
              <button onClick={() => getMOCKJBalance(account!).then(setBalance).catch(() => {})}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <RefreshCw className="w-3 h-3" /> Refresh balance
              </button>
              <span className="text-muted-foreground/30">·</span>
              <a href={`https://sepolia.etherscan.io/address/${MOCKJ_CONTRACT}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-[hsl(191_97%_55%)] hover:opacity-80">
                Contract on Etherscan <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
