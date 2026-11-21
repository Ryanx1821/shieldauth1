/* ==========================================================================
   ShieldAuth — Landing Page Interactivity
   ========================================================================== */

(function () {
  'use strict';

  const toastEl = document.getElementById('toast');
  let toastTimer = null;

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  /* ------------------------------------------------------------------------
     1. Multi-Language Open-Source SDK Explorer
     ------------------------------------------------------------------------ */
  const sdkSnippets = {
    cpp: {
      file: 'main.cpp',
      code: `#include <shieldauth/api.hpp>
#include <iostream>

shieldauth::App app("CoreSuite", "own_44b19e2d", "ed25519:pk_live_8a91c4f0...", "1.0");

int main() {
    app.init();
    if (!app.response.success) {
        std::cerr << "Init failed: " << app.response.message << "\\n";
        return 1;
    }

    std::string key;
    std::cout << "Enter License Key: ";
    std::cin >> key;

    app.license(key);
    if (!app.response.success) {
        std::cerr << "Denied: " << app.response.message << "\\n";
        return 1;
    }

    std::cout << "Logged in! Subscription: " << app.user.subscription << "\\n";
    return 0;
}`
    },
    csharp: {
      file: 'Program.cs',
      code: `using ShieldAuth;

var app = new ShieldAuthApp(
    name: "CoreSuite",
    ownerId: "own_44b19e2d",
    publicKey: "ed25519:pk_live_8a91c4f0...",
    version: "1.0"
);

app.Init();
Console.Write("Enter License Key: ");
var key = Console.ReadLine();

app.License(key);
if (!app.Response.Success) {
    Console.WriteLine($"Error: {app.Response.Message}");
    Environment.Exit(1);
}

var apiUrl = app.GetVar("api_gateway");
Console.WriteLine($"Authenticated as {app.User.Username} ({app.User.Subscription})");`
    },
    python: {
      file: 'main.py',
      code: `from shieldauth import ShieldAuthApp

app = ShieldAuthApp(
    name="CoreSuite",
    owner_id="own_44b19e2d",
    public_key="ed25519:pk_live_8a91c4f0...",
    version="1.0",
)

app.init()
key = input("Enter License Key: ").strip()
app.license(key)

print(f"Welcome {app.user.username} | HWID: {app.user.hwid}")
print("Cloud var:", app.get_var("api_gateway"))`
    },
    rust: {
      file: 'src/main.rs',
      code: `use shieldauth::ShieldAuthApp;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut app = ShieldAuthApp::new(
        "CoreSuite",
        "own_44b19e2d",
        "ed25519:pk_live_8a91c4f0...",
        "1.0",
    );

    app.init().await?;
    app.license("SHLD-9F2A-7C4E-88B1").await?;

    let gateway = app.get_var("api_gateway").await?;
    println!("Authenticated! Gateway: {}", gateway);
    Ok(())
}`
    },
    node: {
      file: 'index.js',
      code: `import { ShieldAuthApp } from '@shieldauth/sdk';

const app = new ShieldAuthApp({
  name: 'CoreSuite',
  ownerId: 'own_44b19e2d',
  publicKey: 'ed25519:pk_live_8a91c4f0...',
  version: '1.0',
});

await app.init();
await app.license('SHLD-9F2A-7C4E-88B1');

const endpoint = await app.getVar('api_gateway');
console.log('Verified user:', app.user.username, endpoint);`
    },
    php: {
      file: 'auth.php',
      code: `<?php
require 'shieldauth.php';

$app = new ShieldAuth\\App("CoreSuite", "own_44b19e2d", "ed25519:pk_live_8a91c4f0...");
$app->init();

if ($app->license($_POST['license_key'])) {
    echo "Authenticated: " . $app->user['username'];
} else {
    http_response_code(401);
    echo "Access denied: " . $app->response['message'];
}`
    },
    java: {
      file: 'Main.java',
      code: `import io.shieldauth.ShieldAuthApp;

public class Main {
    public static void main(String[] args) {
        ShieldAuthApp app = new ShieldAuthApp(
            "CoreSuite", "own_44b19e2d", "ed25519:pk_live_8a91c4f0...", "1.0"
        );

        app.init();
        if (!app.license("SHLD-9F2A-7C4E-88B1")) {
            System.err.println("Denied: " + app.getMessage());
            System.exit(1);
        }

        System.out.println("Verified tier: " + app.getUser().getSubscription());
    }
}`
    },
    lua: {
      file: 'auth.lua',
      code: `local ShieldAuth = require("shieldauth")

local app = ShieldAuth.new({
    name = "CoreSuite",
    owner_id = "own_44b19e2d",
    public_key = "ed25519:pk_live_8a91c4f0...",
    version = "1.0"
})

assert(app:init(), "Failed to connect to ShieldAuth")
local ok, err = app:license("SHLD-9F2A-7C4E-88B1")
if not ok then error("License denied: " .. err) end

print("Authenticated! Subscription:", app.user.subscription)`
    }
  };

  const sdkCodeEl = document.getElementById('sdkCode');
  const sdkFileEl = document.getElementById('sdkFilename');
  const sdkTabs = document.querySelectorAll('.sdk-tab');
  const copySdkBtn = document.getElementById('copySdkBtn');
  let activeLang = 'cpp';

  function renderSdk(lang) {
    const item = sdkSnippets[lang];
    if (!item || !sdkCodeEl || !sdkFileEl) return;
    activeLang = lang;
    sdkFileEl.textContent = item.file;
    sdkCodeEl.textContent = item.code;
    sdkTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.lang === lang));
  }

  sdkTabs.forEach((tab) => {
    tab.addEventListener('click', () => renderSdk(tab.dataset.lang));
  });

  if (copySdkBtn) {
    copySdkBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(sdkSnippets[activeLang].code);
        showToast(`Copied ${sdkSnippets[activeLang].file}`);
      } catch {
        showToast('Clipboard permission unavailable');
      }
    });
  }

  renderSdk('cpp');

  /* ------------------------------------------------------------------------
     2. Monthly / Yearly Pricing Toggle
     ------------------------------------------------------------------------ */
  const billingBtns = document.querySelectorAll('.billing-btn');
  const priceEls = document.querySelectorAll('[data-price-monthly]');
  const periodEls = document.querySelectorAll('[data-period-monthly]');

  billingBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.billing;
      billingBtns.forEach((b) => b.classList.toggle('active', b === btn));
      priceEls.forEach((el) => {
        el.textContent = mode === 'yearly' ? el.dataset.priceYearly : el.dataset.priceMonthly;
      });
      periodEls.forEach((el) => {
        el.textContent = mode === 'yearly' ? el.dataset.periodYearly : el.dataset.periodMonthly;
      });
    });
  });

  /* ------------------------------------------------------------------------
     3. FAQ Accordion
     ------------------------------------------------------------------------ */
  document.querySelectorAll('.faq-q').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  /* ------------------------------------------------------------------------
     4. Auth Page Routing (Google + Manual Sign In / Sign Up)
     ------------------------------------------------------------------------ */
  document.querySelectorAll('[data-open-auth]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const mode = trigger.dataset.openAuth === 'login' ? 'login' : 'register';
      window.location.href = `auth.html?mode=${mode}`;
    });
  });

  document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });
})();
