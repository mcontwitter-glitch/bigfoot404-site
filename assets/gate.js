/* BIGFOOT 404 — Solana NFT Token Gate
 * Verifies the connected wallet holds a Bigfoot 404 NFT (Solana mainnet)
 * and unlocks the gated site sections. Non-holders see locked overlays.
 *
 * ONE thing to fill in when the collection is live on mainnet:
 *   BIGFOOT_CONFIG.creator  — the collection's verified creator address
 *                             (candy machine / first verified creator), OR
 *   BIGFOOT_CONFIG.collectionMint — the collection mint address
 * Until creator is set, verification runs in PREVIEW mode (any NFT passes).
 */
const BIGFOOT_CONFIG = {
  creator: "",                // <-- SET: verified creator pubkey of the BIGFOOT collection
  collectionMint: "",         // <-- optional: collection mint (either check passes)
  collectionName: "Bigfoot 404",
  rpc: "https://api.mainnet-beta.solana.com",
  sessionMinutes: 60,         // how long a verification holds
  get previewMode() { return !this.creator && !this.collectionMint; }
};

const METADATA_PROGRAM = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

(function () {
  const W3 = () => window.solanaWeb3;

  function getProvider() {
    const p = window.phantom && window.phantom.solana ? window.phantom.solana : null;
    if (p) return p;
    if (window.solflare) return window.solflare;
    if (window.solana) return window.solana;
    return null;
  }

  function decodeB64(s) {
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function rpc(method, params) {
    const r = await fetch(BIGFOOT_CONFIG.rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params })
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || "RPC error");
    return j.result;
  }

  async function walletNftMints(owner) {
    const accounts = await rpc("getTokenAccountsByOwner", [
      owner,
      { programId: TOKEN_PROGRAM },
      { encoding: "jsonParsed" }
    ]);
    const list = (accounts && accounts.value) || [];
    const held = [];
    for (var i = 0; i < list.length; i++) {
      var info = list[i].account && list[i].account.data && list[i].account.data.parsed
                 && list[i].account.data.parsed.info;
      if (!info) continue;
      var amt = info.tokenAmount ? info.tokenAmount.uiAmount : 0;
      var mint = info.mint;
      if (mint && amt >= 1 && !held.some(function (h) { return h.mint === mint; }))
        held.push({ mint: mint, amt: amt });
    }
    return held.slice(0, 24); // cap for speed on whale wallets
  }

  async function mintIsBigfoot(mint) {
    try {
      var metaProgram = new (W3().PublicKey)(METADATA_PROGRAM);
      var seedTag = new Uint8Array([109,101,116,97,100,97,116,97]); // "metadata"
      var [pda] = W3().PublicKey.findProgramAddressSync(
        [seedTag, metaProgram.toBuffer(), new (W3().PublicKey)(mint).toBuffer()],
        metaProgram);
      var res = await rpc("getAccountInfo", [pda.toBase58(), { encoding: "base64" }]);
      if (!res || !res.value) return false;
      var meta = JSON.parse(decodeB64(res.value.data[0]));
      var cm = BIGFOOT_CONFIG.collectionMint;
      if (cm && meta.collection && meta.collection.key === cm && meta.collection.verified) return true;
      if (BIGFOOT_CONFIG.creator) {
        var c = (meta.creators || []).find(function (x) { return x.address === BIGFOOT_CONFIG.creator && x.verified; });
        if (c) return true;
      }
      return false;
    } catch (e) { return false; }
  }

  async function verifyHolder(owner) {
    var mints = await walletNftMints(owner);
    var count = 0;
    for (var m of mints) { if (await mintIsBigfoot(m.mint)) count++; }
    return { count: count, scanned: mints.length };
  }

  /* ---------------- gating UI ---------------- */
  var KEY = "bigfoot_gate_v1";

  function setGateUI(state, info) {
    info = info || {};
    document.documentElement.classList.toggle("big-locked", !state);
    document.querySelectorAll(".gated").forEach(function (sec) {
      var ov = sec.querySelector(":scope > .gate-overlay");
      if (state) { if (ov) ov.remove(); sec.classList.remove("is-locked"); return; }
      sec.classList.add("is-locked");
      if (ov) return;
      ov = document.createElement("div");
      ov.className = "gate-overlay";
      ov.innerHTML =
        '<div class="gate-box">' +
        '<div class="gate-icon">&#128274;</div>' +
        '<h4>Holder Access Only</h4>' +
        '<p>This area is token-gated for ' + BIGFOOT_CONFIG.collectionName +
        ' NFT holders. Connect your wallet to verify.</p>' +
        '<button class="gbtn" onclick="bigfootGate.connect()">Connect Wallet</button>' +
        '</div>';
      sec.appendChild(ov);
    });
    document.querySelectorAll(".gate-status").forEach(function (el) {
      if (state) {
        el.textContent = "\u2713 Verified holder" + (info.count ? " \u2014 " + info.count + " NFT" + (info.count > 1 ? "s" : "") : "");
        el.classList.add("ok");
      } else {
        el.textContent = info.reason || "Wallet not verified";
        el.classList.remove("ok");
      }
    });
    var conn = document.getElementById("gateConnectBtn");
    if (conn) {
      conn.textContent = state ? "Verified \u2713" : "Connect Wallet";
      conn.disabled = state;
    }
  }

  async function connect() {
    var p = getProvider();
    if (!p) { setGateUI(false, { reason: "No Solana wallet found \u2014 install Phantom." }); return; }
    try {
      var res = await p.connect();
      var owner = res.publicKey.toString();
      setGateUI(false, { reason: "Verifying NFTs\u2026" });
      var out = await verifyHolder(owner);
      var isHolder = out.count > 0 || (BIGFOOT_CONFIG.previewMode && out.scanned > 0);
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ owner: owner, count: out.count, ts: Date.now(), ok: isHolder }));
      } catch (e) {}
      if (isHolder) setGateUI(true, { count: Math.max(out.count, 1) });
      else setGateUI(false, { reason: "No Bigfoot 404 NFT found in this wallet" });
    } catch (e) {
      var msg = (e && e.message === "User rejected") ? "Connect rejected" : (e && e.message) || "Connect failed";
      setGateUI(false, { reason: msg });
    }
  }

  function boot() {
    try {
      var s = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (s && s.ok && Date.now() - s.ts < BIGFOOT_CONFIG.sessionMinutes * 60000) {
        setGateUI(true, { count: s.count });
        return;
      }
    } catch (e) {}
    setGateUI(false, {});
    var p = getProvider();
    if (p && p.isConnected) connect();
  }

  window.bigfootGate = { connect: connect, boot: boot, config: BIGFOOT_CONFIG };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
