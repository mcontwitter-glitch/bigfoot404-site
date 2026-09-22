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

  async function connect() {
    var p = getProvider();
    if (!p) {
      if (isMobile()) {
        setGateUI(false, {
          reason: "No wallet app browser detected \u2014 tap to open this page inside Phantom.",
          mobile: true,
        });
        return;
      }
      setGateUI(false, { reason: "No Solana wallet found \u2014 install Phantom." });
      return;
    }
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

  window.bigfootGate = { connect: connect, boot: boot, config: BIGFOOT_CONFIG };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
