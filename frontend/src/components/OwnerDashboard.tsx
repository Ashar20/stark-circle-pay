/**
 * Owner (parent) Circle Dashboard.
 *
 * Features:
 *  - Show vault address + QR code (share with members / scan to onboard)
 *  - Add member by email → resolves to Starknet address via backend
 *  - Set daily spending limit per member
 *  - Deposit USDC to vault (ERC20 transfer to vault address)
 *  - List current members with limits and spent-today values
 */
import { useRef, useState } from 'react';
import type { WalletInterface } from 'starkzap';
import type { Call } from 'starknet';

interface Member {
  address: string;
  email: string;
  limit: string;   // in USDC units (e.g. "50")
  spent: string;
}

interface Props {
  wallet: WalletInterface;
  vaultAddress: string;
}

const USDC_DECIMALS = 6;
const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS ?? '';
const RESOLVE_MEMBER_API = import.meta.env.VITE_RESOLVE_MEMBER_API ?? '';

function toU128Felt(usdcAmount: string): string {
  // Convert human USDC amount to u128 smallest units (6 decimals)
  return String(Math.round(parseFloat(usdcAmount) * 10 ** USDC_DECIMALS));
}

export function OwnerDashboard({ wallet, vaultAddress }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [limit, setLimit] = useState('50');
  const [depositAmount, setDepositAmount] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);


  const addMember = async () => {
    if (!email || !limit) return;
    setBusy(true);
    setStatus(null);
    try {
      let memberAddress = email;
      // If looks like a Starknet address (0x...) use directly; else resolve via backend
      if (!email.startsWith('0x') && RESOLVE_MEMBER_API) {
        const res = await fetch(RESOLVE_MEMBER_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) throw new Error('Could not resolve member address');
        const data = await res.json();
        memberAddress = data.address;
      }

      const call: Call = {
        contractAddress: vaultAddress,
        entrypoint: 'add_member',
        calldata: [memberAddress, toU128Felt(limit)],
      };
      const tx = await wallet.execute([call], { feeMode: 'sponsored' });
      await tx.wait();

      setMembers((prev) => [
        ...prev,
        { address: memberAddress, email, limit, spent: '0' },
      ]);
      setEmail('');
      setStatus(`Member added: ${memberAddress.slice(0, 10)}…`);
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (member: Member) => {
    setBusy(true);
    setStatus(null);
    try {
      const call: Call = {
        contractAddress: vaultAddress,
        entrypoint: 'remove_member',
        calldata: [member.address],
      };
      const tx = await wallet.execute([call], { feeMode: 'sponsored' });
      await tx.wait();
      setMembers((prev) => prev.filter((m) => m.address !== member.address));
      setStatus('Member removed');
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const depositUsdc = async () => {
    if (!depositAmount || !USDC_ADDRESS) return;
    setBusy(true);
    setStatus(null);
    try {
      // ERC20 transfer: owner sends USDC to vault address
      const amount = toU128Felt(depositAmount);
      // u256 in Starknet calldata = low + high felts
      const call: Call = {
        contractAddress: USDC_ADDRESS,
        entrypoint: 'transfer',
        calldata: [vaultAddress, amount, '0'], // low, high
      };
      const tx = await wallet.execute([call], { feeMode: 'sponsored' });
      await tx.wait();
      setDepositAmount('');
      setStatus(`Deposited ${depositAmount} USDC to vault`);
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const copyVault = () => {
    navigator.clipboard.writeText(vaultAddress);
    setStatus('Vault address copied!');
  };

  return (
    <div className="dashboard">
      {/* Vault address card */}
      <section className="card vault-card">
        <h2>Circle Vault</h2>
        <p className="vault-addr">{vaultAddress}</p>
        <button type="button" className="btn-outline" onClick={copyVault}>
          Copy address
        </button>
        <p className="hint">Share this address with members to receive funds / for QR linking.</p>
      </section>

      {/* Deposit USDC */}
      <section className="card">
        <h2>Deposit USDC</h2>
        <div className="row">
          <input
            type="number"
            min="0"
            step="1"
            placeholder="Amount (e.g. 100)"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
          />
          <button type="button" className="btn-primary" onClick={depositUsdc} disabled={busy || !depositAmount || !USDC_ADDRESS}>
            Deposit
          </button>
        </div>
        {!USDC_ADDRESS && (
          <p className="hint error-hint">Set VITE_USDC_ADDRESS in .env</p>
        )}
      </section>

      {/* Add member */}
      <section className="card">
        <h2>Add Member</h2>
        <input
          type="email"
          placeholder="member@email.com or 0x…address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="row limit-row">
          <label>Daily limit (USDC)</label>
          <input
            type="number"
            min="1"
            step="1"
            placeholder="50"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={addMember}
          disabled={busy || !email || !limit}
        >
          {busy ? 'Adding…' : 'Add Member'}
        </button>
      </section>

      {/* Member list */}
      {members.length > 0 && (
        <section className="card">
          <h2>Members</h2>
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.address} className="member-row">
                <div>
                  <span className="member-email">{m.email}</span>
                  <span className="member-addr">{m.address.slice(0, 10)}…</span>
                  <span className="member-limit">Limit: ${m.limit}/day</span>
                  <span className="member-spent">Spent: ${m.spent}</span>
                </div>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => removeMember(m)}
                  disabled={busy}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {status && <p className={`status-msg ${status.startsWith('Error') ? 'error' : 'success'}`}>{status}</p>}

      {/* QR placeholder */}
      <div ref={qrRef} />
    </div>
  );
}
