/**
 * Stark-Circle App
 *
 * Full flow:
 *  1. Not logged in → Auth screen (Privy login)
 *  2. Logged in, no wallet → Role picker: "I'm a Parent" / "I'm a Child"
 *  3. Role picked → Connect Wallet (sponsored onboarding)
 *  4. Wallet connected:
 *     - Parent → OwnerDashboard (add members, set limits, deposit USDC)
 *     - Child  → TapToPay (scan QR → biometric → sponsored spend)
 *
 * Role is persisted in localStorage so refresh doesn't reset it.
 * Owner can also be auto-detected via get_owner() on-chain if VITE_VAULT_ADDRESS is set.
 */
import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useStarkCircle } from './hooks/useStarkCircle';
import { OwnerDashboard } from './components/OwnerDashboard';
import { TapToPay } from './components/TapToPay';
import './App.css';

const VAULT_ADDRESS = import.meta.env.VITE_VAULT_ADDRESS ?? '';
const ROLE_KEY = 'sc_role';

type Role = 'owner' | 'member';

// ── Starknet keccak selector (simplified: use pre-computed value) ────────
// Real selector for get_owner = keccak256("get_owner") & (2^250 - 1)
// Pre-computed: 0x162da33a4585851fe8d3af3c2a9c60b557814e221e0d4f32efa61d4b4e28b48
const GET_OWNER_SELECTOR = '0x162da33a4585851fe8d3af3c2a9c60b557814e221e0d4f32efa61d4b4e28b48';

async function fetchVaultOwner(rpcUrl: string, vaultAddress: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'starknet_call',
      params: [
        {
          contract_address: vaultAddress,
          entry_point_selector: GET_OWNER_SELECTOR,
          calldata: [],
        },
        'latest',
      ],
    }),
  });
  const json = await res.json();
  return (json?.result?.[0] ?? '').toLowerCase().replace(/^0x0*/, '');
}

function App() {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  const { wallet, onboardMember, executeDelegatedSpend, error, loading } = useStarkCircle();

  // Role: persisted across refreshes
  const [role, setRole] = useState<Role | null>(() => {
    const stored = localStorage.getItem(ROLE_KEY);
    return stored === 'owner' || stored === 'member' ? stored : null;
  });

  // Whether we've tried auto-detecting role from chain
  const [detecting, setDetecting] = useState(false);

  const rpcUrl = import.meta.env.VITE_RPC_URL ?? 'https://starknet-sepolia.public.blastapi.io/rpc/v0_8';

  // When wallet becomes available and role is not manually set, try chain detection
  useEffect(() => {
    if (!wallet || !VAULT_ADDRESS || role !== null) return;
    setDetecting(true);
    fetchVaultOwner(rpcUrl, VAULT_ADDRESS)
      .then((ownerAddr) => {
        const walletAddr = wallet.address.toString().toLowerCase().replace(/^0x0*/, '');
        const detected: Role = walletAddr === ownerAddr ? 'owner' : 'member';
        setRole(detected);
        localStorage.setItem(ROLE_KEY, detected);
      })
      .catch(() => {
        // Chain read failed — stay on role picker
      })
      .finally(() => setDetecting(false));
  }, [wallet, role, rpcUrl]);

  const chooseRole = (r: Role) => {
    setRole(r);
    localStorage.setItem(ROLE_KEY, r);
  };

  const switchRole = () => {
    const next: Role = role === 'owner' ? 'member' : 'owner';
    setRole(next);
    localStorage.setItem(ROLE_KEY, next);
  };

  const handleOnboard = async () => {
    try {
      await onboardMember(getAccessToken);
    } catch (e) {
      console.error(e);
    }
  };

  // ── 1. Privy not ready ─────────────────────────────────────────────
  if (!ready) {
    return (
      <div className="app loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  // ── 2. Not logged in ───────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="app auth-screen">
        <div className="logo-block">
          <div className="logo-icon" aria-hidden>⭕</div>
          <h1>Stark-Circle</h1>
          <p className="tagline">
            Google Pay-style delegation on Starknet.<br />
            No gas. No seed phrase.
          </p>
        </div>
        <button type="button" className="btn-primary btn-large" onClick={login}>
          Sign in to continue
        </button>
      </div>
    );
  }

  // ── 3. Logged in, but no role chosen yet ───────────────────────────
  if (role === null) {
    return (
      <div className="app auth-screen">
        <div className="logo-block">
          <div className="logo-icon" aria-hidden>⭕</div>
          <h1>Who are you?</h1>
          <p className="tagline">Choose your role to continue.</p>
        </div>

        <div className="role-picker">
          <button type="button" className="role-card" onClick={() => chooseRole('owner')}>
            <span className="role-icon" aria-hidden>👨‍👩‍👧</span>
            <span className="role-title">Parent / Owner</span>
            <span className="role-desc">
              Create a circle, set spending limits for family members, deposit USDC.
            </span>
          </button>

          <button type="button" className="role-card" onClick={() => chooseRole('member')}>
            <span className="role-icon" aria-hidden>💳</span>
            <span className="role-title">Member / Child</span>
            <span className="role-desc">
              Scan merchant QR codes to pay from your circle allowance. $0 gas.
            </span>
          </button>
        </div>

        <button type="button" className="btn-ghost" onClick={logout}>
          Sign out
        </button>
      </div>
    );
  }

  // ── 4. Role chosen, but no wallet yet ─────────────────────────────
  if (!wallet) {
    return (
      <div className="app onboard-screen">
        <div className="logo-block">
          <div className="logo-icon" aria-hidden>
            {role === 'owner' ? '👨‍👩‍👧' : '💳'}
          </div>
          <h1>{role === 'owner' ? 'Circle Dashboard' : 'Tap to Pay'}</h1>
          <p className="tagline">
            {role === 'owner'
              ? 'Connect your wallet to manage your circle.'
              : 'Connect your wallet to start paying with your allowance.'}
          </p>
        </div>

        {error && <p className="error">{error}</p>}

        <button
          type="button"
          className="btn-primary btn-large"
          onClick={handleOnboard}
          disabled={loading}
        >
          {loading ? 'Connecting…' : 'Connect Wallet (free)'}
        </button>

        <button
          type="button"
          className="btn-ghost"
          onClick={() => { setRole(null); localStorage.removeItem(ROLE_KEY); }}
        >
          ← Change role
        </button>
        <button type="button" className="btn-ghost" onClick={logout}>
          Sign out
        </button>
      </div>
    );
  }

  // ── 5. Chain detection in progress ────────────────────────────────
  if (detecting) {
    return (
      <div className="app loading-screen">
        <div className="spinner" />
        <p style={{ marginTop: '1rem', color: 'var(--text-2)', fontSize: '0.9rem' }}>
          Checking vault…
        </p>
      </div>
    );
  }

  // ── 6. Wallet connected — show correct view ────────────────────────
  const userEmail = user?.email?.address ?? user?.google?.email ?? wallet.address.toString();
  const userId = user?.id ?? wallet.address.toString();

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">⭕ Stark-Circle</h1>
        <div className="header-actions">
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={switchRole}
            title={`Switch to ${role === 'owner' ? 'member' : 'owner'} view`}
          >
            {role === 'owner' ? '👨‍👩‍👧 Parent' : '💳 Child'}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {!VAULT_ADDRESS && role === 'owner' && (
        <div className="banner warn-banner">
          Set <code>VITE_VAULT_ADDRESS</code> in .env after deploying the Cairo contract.
        </div>
      )}

      {role === 'owner' && (
        <OwnerDashboard wallet={wallet} vaultAddress={VAULT_ADDRESS} />
      )}

      {role === 'member' && (
        <TapToPay
          wallet={wallet}
          userEmail={userEmail}
          userId={userId}
          executeDelegatedSpend={executeDelegatedSpend}
        />
      )}
    </div>
  );
}

export default App;
