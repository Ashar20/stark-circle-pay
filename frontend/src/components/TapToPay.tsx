/**
 * Child / Member "Tap to Pay" view.
 *
 * Flow:
 *  1. Idle: show "Scan QR" button and wallet balance hint.
 *  2. Scanning: html5-qrcode opens camera; merchant QR encodes JSON:
 *       { vault, token, merchant, amount, label? }
 *  3. Confirm: show payment details + biometric prompt (WebAuthn).
 *  4. Sending: execute sponsored spend on-chain.
 *  5. Success / Error.
 *
 * Merchant QR payload format (JSON string):
 *   { "vault": "0x…", "token": "0x…", "merchant": "0x…", "amount": "5000000", "label": "Coffee $5" }
 *   amount is in token smallest units (USDC 6 decimals → $5 = "5000000")
 */
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import type { WalletInterface } from 'starkzap';
import {
  authenticateBiometric,
  hasBiometricRegistered,
  isBiometricAvailable,
  registerBiometric,
} from '../hooks/useBiometric';

interface MerchantPayload {
  vault: string;
  token: string;
  merchant: string;
  amount: string;   // smallest units
  label?: string;
}

interface Props {
  wallet: WalletInterface;
  userEmail: string;
  userId: string;
  executeDelegatedSpend: (vault: string, token: string, merchant: string, amount: string) => Promise<unknown>;
}

type Stage = 'idle' | 'scanning' | 'confirm' | 'sending' | 'success' | 'error';

const USDC_DECIMALS = 6;

function formatAmount(raw: string): string {
  const n = Number(raw) / 10 ** USDC_DECIMALS;
  return `$${n.toFixed(2)}`;
}

export function TapToPay({ wallet, userEmail, userId, executeDelegatedSpend }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [payload, setPayload] = useState<MerchantPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [biometricReady, setBiometricReady] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanDivId = 'sc-qr-reader';

  // Register biometric on first load if not yet done
  useEffect(() => {
    if (!isBiometricAvailable()) {
      setBiometricReady(false);
      return;
    }
    if (hasBiometricRegistered()) {
      setBiometricReady(true);
      return;
    }
    // Auto-register passkey after wallet onboarding
    registerBiometric(userId, userEmail)
      .then(() => setBiometricReady(true))
      .catch((e) => console.warn('Biometric registration skipped:', e));
  }, [userId, userEmail]);

  const startScan = async () => {
    setStage('scanning');
    const scanner = new Html5Qrcode(scanDivId);
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: 'environment' }, // rear camera
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // QR decoded — stop scanner and parse payload
          scanner.stop().catch(() => {});
          try {
            const p: MerchantPayload = JSON.parse(decodedText);
            if (!p.vault || !p.token || !p.merchant || !p.amount) {
              throw new Error('Invalid QR payload');
            }
            setPayload(p);
            setStage('confirm');
          } catch {
            setErrorMsg('Invalid merchant QR code. Expected JSON with vault/token/merchant/amount.');
            setStage('error');
          }
        },
        () => { /* ignore scan errors (partial frames) */ }
      );
    } catch (e) {
      setErrorMsg(`Camera error: ${e instanceof Error ? e.message : String(e)}`);
      setStage('error');
    }
  };

  const cancelScan = () => {
    scannerRef.current?.stop().catch(() => {});
    setStage('idle');
  };

  const confirmPay = async () => {
    if (!payload) return;
    setStage('sending');
    try {
      // Biometric gate — triggers OS fingerprint / face ID prompt
      if (isBiometricAvailable() && biometricReady) {
        const verified = await authenticateBiometric();
        if (!verified) throw new Error('Biometric verification failed');
      }
      await executeDelegatedSpend(payload.vault, payload.token, payload.merchant, payload.amount);
      setStage('success');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStage('error');
    }
  };

  const reset = () => {
    setPayload(null);
    setErrorMsg('');
    setStage('idle');
  };

  return (
    <div className="tap-to-pay">
      <div className="wallet-pill">
        <span className="wallet-dot" />
        {wallet.address.toString().slice(0, 8)}…{wallet.address.toString().slice(-6)}
      </div>

      {stage === 'idle' && (
        <div className="idle-view">
          <div className="pay-icon" aria-hidden>💳</div>
          <h2>Tap to Pay</h2>
          <p className="hint">Scan a merchant QR to pay with your circle allowance. Gas is sponsored — you pay $0.</p>
          <button type="button" className="btn-primary btn-large" onClick={startScan}>
            Scan QR Code
          </button>
          {!biometricReady && isBiometricAvailable() && (
            <p className="hint warn">Biometric not yet registered — payment will proceed without fingerprint confirmation.</p>
          )}
          {!isBiometricAvailable() && (
            <p className="hint warn">WebAuthn not supported on this device — payment will proceed without biometric.</p>
          )}
        </div>
      )}

      {stage === 'scanning' && (
        <div className="scan-view">
          <h2>Scan Merchant QR</h2>
          <div id={scanDivId} className="qr-reader" />
          <button type="button" className="btn-outline" onClick={cancelScan}>
            Cancel
          </button>
        </div>
      )}

      {stage === 'confirm' && payload && (
        <div className="confirm-view">
          <div className="confirm-amount">{formatAmount(payload.amount)}</div>
          {payload.label && <p className="confirm-label">{payload.label}</p>}
          <p className="confirm-detail">To: {payload.merchant.slice(0, 10)}…</p>
          <p className="confirm-detail">Via vault: {payload.vault.slice(0, 10)}…</p>
          <p className="biometric-hint">
            {biometricReady
              ? '👆 Confirm with fingerprint / face ID'
              : 'Tap to confirm payment'}
          </p>
          <button type="button" className="btn-primary btn-large" onClick={confirmPay}>
            {biometricReady ? 'Confirm & Pay' : 'Pay Now'}
          </button>
          <button type="button" className="btn-outline" onClick={reset}>
            Cancel
          </button>
        </div>
      )}

      {stage === 'sending' && (
        <div className="sending-view">
          <div className="spinner" aria-label="Sending payment" />
          <p>Confirming on Starknet…</p>
          <p className="hint">Gas is sponsored. No ETH needed.</p>
        </div>
      )}

      {stage === 'success' && (
        <div className="success-view">
          <div className="success-icon" aria-hidden>✅</div>
          <h2>Payment sent!</h2>
          {payload && <p className="confirm-amount">{formatAmount(payload.amount)}</p>}
          <p className="hint">Transaction confirmed on Starknet.</p>
          <button type="button" className="btn-primary" onClick={reset}>
            Done
          </button>
        </div>
      )}

      {stage === 'error' && (
        <div className="error-view">
          <div className="error-icon" aria-hidden>❌</div>
          <h2>Something went wrong</h2>
          <p className="error">{errorMsg}</p>
          <button type="button" className="btn-outline" onClick={reset}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
