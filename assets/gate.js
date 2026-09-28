/* BIGFOOT — Solana NFT Token Gate (Metaplex Core)
 * Verifies the connected wallet holds a Bigfoot NFT from the official
 * Metaplex Core "Bigfoot" collection on Solana mainnet and unlocks the
 * gated site sections. Non-holders see locked overlays.
 *
 * This browser-only check is for display, not server-side access control.
 * Private holder content must be guarded by server-side authorization.
 */
const BIGFOOT_CONFIG = {
  /* Official Bigfoot collection — Metaplex Core, "Bigfoot", 1,500 minted */
  collection: "CEYQLZWtF9sqMATXJGkM8UqP5JQjEcCaBBmmXtJkL3pF",
  collectionName: "Bigfoot",
  rpc: "https://api.mainnet-beta.solana.com",
};

(function () {
  function getProvider() {
    const p = window.phantom && window.phantom.solana ? window.phantom.solana : null;
    if (p) return p;
    if (window.solflare) return window.solflare;
    if (window.backpack) return window.backpack;
    if (window.solana) return window.solana;
    return null;
  }

  /* ---------------- on-chain holder verification ----------------
   * Pure direct RPC — no Magic Eden, no SDK CDN imports, no DAS. One
   * getProgramAccounts call against the Metaplex Core program with
   * server-side memcmp filters so only this wallet's Bigfoot assets
   * are returned, plus a dataSlice that fetches just the name field.
   * Assets minted into the collection carry the collection address as
   * their update authority, so the match is exact and unspoofable.
   *
   * Metaplex Core account layout (NO discriminator prefix; first byte
   * is the key):  key(1)=0x01 AssetV1 | owner(32)@1 | update authority
   * dataEnum tag@33, pubkey@34 | name string len@66. Verified against
   * the live program: this filter set returns exactly the 1,500 minted.
   */
  var CORE_PROGRAM = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";
  var RPC_FALLBACKS = [
    "https://rpc.ankr.com/solana",
    "https://solana-rpc.publicnode.com",
    "https://solana.api.onfinality.io/public",
  ];

  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function rpcGpa(rpc, body) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 12000);
    try {
      var r = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error("HTTP " + r.status);            // 429/5xx -> next endpoint
      var j = await r.json();
      if (j.error) throw new Error(j.error.message || "rpc error");
      return j.result || [];
    } finally { clearTimeout(timer); }
  }

  async function verifyHolder(owner) {
    var body = {
      jsonrpc: "2.0", id: 1, method: "getProgramAccounts",
      params: [CORE_PROGRAM, {
        encoding: "base64",
        dataSlice: { offset: 66, length: 56 },   // name string only
        filters: [
          { memcmp: { offset: 0,  bytes: "2" } },                 // key byte 0x01 = AssetV1
          { memcmp: { offset: 1,  bytes: owner } },              // this wallet
          { memcmp: { offset: 34, bytes: BIGFOOT_CONFIG.collection } },
        ],
      }],
    };
    var accounts = null, lastErr = null;
    var endpoints = [BIGFOOT_CONFIG.rpc].concat(RPC_FALLBACKS);
    for (var pass = 0; pass < 2 && accounts === null; pass++) {
      for (var i = 0; i < endpoints.length; i++) {
        try { accounts = await rpcGpa(endpoints[i], body); break; }
        catch (e) { lastErr = e; await new Promise(function (res) { setTimeout(res, 600); }); }
      }
    }
    if (accounts === null) throw lastErr || new Error("All RPC endpoints failed");
    var held = accounts.map(function (acc) {
      var name = "";
      try {
        var d = b64ToBytes(acc.account.data[0]);
        var len = (d[0] | d[1] << 8 | d[2] << 16 | d[3] << 24) >>> 0;
        name = new TextDecoder().decode(d.subarray(4, 4 + Math.min(len, d.length - 4)));
      } catch (e) {}
      return { mint: acc.pubkey, name: name, uri: "" };
    });
    return { count: held.length, assets: held, scanned: held.length };
  }

  /* ---------------- gating UI ---------------- */
  var KEY = "bigfoot_gate_v1";

  function setGateUI(state, info) {
    info = info || {};
    document.documentElement.classList.toggle("big-locked", !state);
    /* CRM gate hook: pages hosting protected content (crm.html) listen for this
     * event to load the real content only after verification clears the wallet. */
    try { document.dispatchEvent(new CustomEvent("bigfoot-gate-change", { detail: { unlocked: !!state, count: info.count || 0, reason: info.reason || "" } })); } catch (e) {}
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
    var out = document.getElementById("holderOut");
    if (out) {
      if (!state && info.mobile) {
        out.innerHTML =
          '<div class="mobile-wallet-links" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
          '<a class="wbtn secondary" href="' + phantomBrowseUrl() + '">Open in Phantom</a>' +
          '<a class="wbtn secondary" href="' + solflareBrowseUrl() + '">Open in Solflare</a>' +
          '</div>';
      } else if (!state) {
        out.innerHTML = "";
      }
    }
  }

  function isMobile() {
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent || "");
  }

  /* Mobile browsers (Chrome, Samsung Internet, Safari, etc.) never get an
   * injected wallet provider like desktop extensions do. The fix is Phantom's
   * documented "browse" deep link, which reopens this exact page inside
   * Phantom's in-app browser -- where window.solana IS injected, so the
   * normal connect() flow below just works unchanged. */
  function phantomBrowseUrl() {
    var url = encodeURIComponent(location.href);
    var ref = encodeURIComponent(location.origin);
    return "https://phantom.app/ul/browse/" + url + "?ref=" + ref;
  }
  function solflareBrowseUrl() {
    var url = encodeURIComponent(location.href);
    var ref = encodeURIComponent(location.origin);
    return "https://solflare.com/ul/v1/browse/" + url + "?ref=" + ref;
  }

  /* ---------------- floating connect modal ----------------
   * Fires no matter where "Connect Wallet" is clicked on the page (nav,
   * hero, or the in-panel button) so the user always sees something happen,
   * even when the click target is scrolled out of view. */
  var MODAL_ID = "bigfootWalletModal";
  function ensureModalStyles() {
    if (document.getElementById("bigfootWalletModalStyles")) return;
    var css = document.createElement("style");
    css.id = "bigfootWalletModalStyles";
    css.textContent =
      "#" + MODAL_ID + "{position:fixed;inset:0;z-index:9999;display:flex;" +
      "align-items:center;justify-content:center;background:rgba(6,10,6,.72);" +
      "padding:20px;box-sizing:border-box}" +
      "#" + MODAL_ID + " .bwm-box{position:relative;max-width:360px;width:100%;" +
      "background:#0c150c;border:1px solid rgba(126,242,155,.35);border-radius:14px;" +
      "padding:26px 24px;box-shadow:0 16px 48px rgba(0,0,0,.55);text-align:center;" +
      "font-family:inherit;color:#eafff0}" +
      "#" + MODAL_ID + " h4{margin:6px 0 8px;font-size:16px;letter-spacing:.03em}" +
      "#" + MODAL_ID + " p{margin:0 0 16px;font-size:13px;opacity:.85;line-height:1.4}" +
      "#" + MODAL_ID + " .bwm-close{position:absolute;top:10px;right:12px;" +
      "background:none;border:0;color:#9fdcae;font-size:18px;cursor:pointer;line-height:1}" +
      "#" + MODAL_ID + " .bwm-link{display:block;margin:0 0 10px;padding:11px 18px;" +
      "border-radius:8px;font-weight:700;font-size:13px;letter-spacing:.04em;" +
      "text-transform:uppercase;text-decoration:none;background:linear-gradient(90deg,#7ef29b,#4ad46f);" +
      "color:#08130a}" +
      "#" + MODAL_ID + " .bwm-link:last-of-type{margin-bottom:0}" +
      "#" + MODAL_ID + " .bwm-link.bwm-ghost{background:transparent;color:#7ef29b;" +
      "border:1px solid rgba(126,242,155,.4)}";
    document.head.appendChild(css);
  }
  function closeWalletModal() {
    var m = document.getElementById(MODAL_ID);
    if (m) m.remove();
  }
  function showWalletModal(title, body, linksHtml) {
    ensureModalStyles();
    closeWalletModal();
    var wrap = document.createElement("div");
    wrap.id = MODAL_ID;
    wrap.innerHTML =
      '<div class="bwm-box">' +
      '<button class="bwm-close" aria-label="Close" onclick="bigfootGate.closeModal()">&times;</button>' +
      "<h4>" + title + "</h4>" +
      "<p>" + body + "</p>" +
      linksHtml +
      "</div>";
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) closeWalletModal();
    });
    document.body.appendChild(wrap);
  }

  var activeOwner = null;
  var verificationVersion = 0;
  function onWalletDisconnected() {
    activeOwner = null;
    verificationVersion++;
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    setGateUI(false, { reason: "Wallet not verified" });
  }

  async function onWalletAccount(owner) {
    if (!owner || owner === activeOwner) return;
    activeOwner = owner;
    var version = ++verificationVersion;
    closeWalletModal();
    setGateUI(false, { reason: "Verifying NFTs\u2026" });
    try {
      var out = await verifyHolder(owner);
      if (version !== verificationVersion) return; // account changed during scan
      var isHolder = out.count > 0;
      if (isHolder) setGateUI(true, { count: out.count });
      else {
        activeOwner = null; // allow another scan if holdings change
        setGateUI(false, { reason: "No Bigfoot NFT found in this wallet" });
      }
    } catch (e) {
      if (version !== verificationVersion) return;
      activeOwner = null;
      setGateUI(false, { reason: "NFT scan failed. Please try again." });
    }
  }

  async function connect() {
    // Reown's Solana modal works from normal mobile browsers via WalletConnect.
    // Unlike injected extensions, it can hand off to installed wallet apps.
    if (window.bigfootWalletConnect) {
      try {
        await window.bigfootWalletConnect.open();
        return;
      } catch (e) { /* retain the injected/deep-link fallback below */ }
    }
    var p = getProvider();
    if (!p) {
      if (isMobile()) {
        setGateUI(false, {
          reason: "No wallet app browser detected \u2014 tap to open this page inside Phantom.",
          mobile: true,
        });
        showWalletModal(
          "Open Your Wallet App",
          "WalletConnect is still loading, or is unavailable. You can also open this page inside Phantom or Solflare.",
          '<a class="bwm-link" href="' + phantomBrowseUrl() + '">Open in Phantom</a>' +
          '<a class="bwm-link bwm-ghost" href="' + solflareBrowseUrl() + '">Open in Solflare</a>'
        );
        return;
      }
      setGateUI(false, { reason: "No Solana wallet found \u2014 install Phantom." });
      showWalletModal(
        "No Wallet Found",
        "WalletConnect is unavailable. Install the Phantom or Solflare browser extension, then try again.",
        '<a class="bwm-link" href="https://phantom.app/download" target="_blank" rel="noopener">Get Phantom</a>' +
        '<a class="bwm-link bwm-ghost" href="https://solflare.com/download" target="_blank" rel="noopener">Get Solflare</a>'
      );
      return;
    }
    closeWalletModal();
    try {
      var res = await p.connect();
      var owner = (res.publicKey || p.publicKey).toString();
      await onWalletAccount(owner);
      if (p.on && !p._bigfootDisconnectBound) {
        p.on("disconnect", onWalletDisconnected);
        p._bigfootDisconnectBound = true;
      }
    } catch (e) {
      var msg = (e && e.message === "User rejected") ? "Connect rejected" : (e && e.message) || "Connect failed";
      setGateUI(false, { reason: msg });
    }
  }

  function boot() {
    // Never unlock based only on mutable sessionStorage: require a live wallet.
    if (activeOwner) return; // AppKit may reconnect before DOMContentLoaded.
    onWalletDisconnected();
    var p = getProvider();
    if (p && p.isConnected && p.publicKey) onWalletAccount(p.publicKey.toString());
  }

  window.bigfootGate = {
    connect: connect, boot: boot, config: BIGFOOT_CONFIG,
    closeModal: closeWalletModal,
    onWalletAccount: onWalletAccount, onWalletDisconnected: onWalletDisconnected,
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
