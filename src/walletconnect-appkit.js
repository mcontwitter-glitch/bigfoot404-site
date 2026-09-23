/* Reown AppKit / WalletConnect for Bigfoot NFT holder verification.
 * The project ID is a public client identifier embedded at build time.
 * Wallet connection requests no transaction or signature.
 */
import { createAppKit } from '@reown/appkit';
import { SolanaAdapter } from '@reown/appkit-adapter-solana';
import { solana } from '@reown/appkit/networks';

const projectId = __WALLETCONNECT_PROJECT_ID__;
const modal = createAppKit({
  adapters: [new SolanaAdapter()],
  networks: [solana], // NFTs are on Solana mainnet, never devnet
  defaultNetwork: solana,
  enableNetworkSwitch: false,
  enableMobileFullScreen: true,
  projectId,
  metadata: {
    name: 'Bigfoot 404',
    description: 'Verify Bigfoot 404 NFT ownership',
    url: 'https://bigfoot404.biz',
    icons: ['https://bigfoot404.biz/assets/logo-bw.png'],
  },
  features: { analytics: false, swaps: false, onramp: false, connectMethodsOrder: ['wallet'] },
});

window.bigfootWalletConnect = {
  open() { return modal.open({ view: 'Connect', namespace: 'solana' }); },
  disconnect() { return modal.adapter?.connectionControllerClient?.disconnect(); },
};

modal.subscribeAccount((state) => {
  if (!window.bigfootGate) return;
  if (!state?.isConnected || !state.address) {
    window.bigfootGate.onWalletDisconnected();
    return;
  }
  window.bigfootGate.onWalletAccount(state.address);
}, 'solana');

// Handle an already-restored session after a refresh without prompting again.
const restoredAccount = modal.getAccount('solana');
if (restoredAccount.isConnected && restoredAccount.address) {
  window.bigfootGate?.onWalletAccount(restoredAccount.address);
}
