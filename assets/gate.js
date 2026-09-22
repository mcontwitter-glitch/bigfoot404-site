/* BIGFOOT — Solana NFT Token Gate (Metaplex Core)
 * Verifies the connected wallet holds a Bigfoot NFT from the official
 * Metaplex Core "Bigfoot" collection on Solana mainnet and unlocks the
 * gated site sections. Non-holders see locked overlays.
 *
 * Verification is exact: Core assets carry the collection address as their
 * update authority, so the match is unspoofable.
 */
const BIGFOOT_CONFIG = {
  /* Official Bigfoot collection — Metaplex Core, "Bigfoot", 1,500 minted */
  collection: "CEYQLZWtF9sqMATXJGkM8UqP5JQjEcCaBBmmXtJkL3pF",
  collectionName: "Bigfoot",
  rpc: "https://api.mainnet-beta.solana.com",
  sessionMinutes: 60,         // how long a verification holds
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

  async function verifyHolder(owner) {
    const { createUmi } = await import("https://esm.sh/@metaplex-foundation/umi-bundle-defaults@1.6.0");
    const { publicKey } = await import("https://esm.sh/@metaplex-foundation/umi@1.6.0");
    const { fetchAssetsByOwner } = await import("https://esm.sh/@metaplex-foundation/mpl-core@1.10.0");
    const umi = createUmi(BIGFOOT_CONFIG.rpc);
    const assets = await fetchAssetsByOwner(umi, publicKey(owner), { skipDerivePlugins: true });
    const held = assets.filter(function (a) {
      const ua = a.updateAuthority;
      const addr = ua ? (ua.fields ? ua.fields[0] : ua.address) : null;
      return String(addr) === BIGFOOT_CONFIG.collection;
    }).map(function (a) {
      return { mint: String(a.publicKey), name: a.name, uri: String(a.uri || "") };
    });
    return { count: held.length, assets: held, scanned: assets.length };
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

  async function connect() {
    var p = getProvider();
    if (!p) {
      if (isMobile()) {
        setGateUI(false, {
          reason: "No wallet app browser detected \u2014 tap to open this page inside Phantom.",
          mobile: true,
        });
        showWalletModal(
          "Open Your Wallet App",
          "Mobile browsers can\u2019t pop up a wallet extension. Tap below to reopen this page inside Phantom or Solflare \u2014 wallet connect works instantly there.",
          '<a class="bwm-link" href="' + phantomBrowseUrl() + '">Open in Phantom</a>' +
          '<a class="bwm-link bwm-ghost" href="' + solflareBrowseUrl() + '">Open in Solflare</a>'
        );
        return;
      }
      setGateUI(false, { reason: "No Solana wallet found \u2014 install Phantom." });
      showWalletModal(
        "No Wallet Found",
        "Install the Phantom or Solflare browser extension, then click Connect Wallet again.",
        '<a class="bwm-link" href="https://phantom.app/download" target="_blank" rel="noopener">Get Phantom</a>' +
        '<a class="bwm-link bwm-ghost" href="https://solflare.com/download" target="_blank" rel="noopener">Get Solflare</a>'
      );
      return;
    }
    closeWalletModal();
    try {
      var res = await p.connect();
      var owner = res.publicKey.toString();
      setGateUI(false, { reason: "Verifying NFTs\u2026" });
      var out = await verifyHolder(owner);
      var isHolder = out.count > 0;
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ owner: owner, count: out.count, ts: Date.now(), ok: isHolder }));
      } catch (e) {}
      if (isHolder) setGateUI(true, { count: out.count });
      else setGateUI(false, { reason: "No Bigfoot NFT found in this wallet" });
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

  window.bigfootGate = { connect: connect, boot: boot, config: BIGFOOT_CONFIG, closeModal: closeWalletModal };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
