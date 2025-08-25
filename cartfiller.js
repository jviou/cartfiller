async function screenshot(page, tag) {
  try {
    const path = `/tmp/${Date.now()}-${tag}.png`;
    await page.screenshot({ path, fullPage: true });
    console.log("🖼  Screenshot:", path);
  } catch (e) { console.log("⚠️ Screenshot KO:", e.message); }
}

async function clickConsentIfAny(page) {
  await page
    .click('button:has-text("Tout accepter"), button:has-text("Accepter"), [id*="didomi"], [id*="tarteaucitron"] button:has-text("OK")', { timeout: 3000 })
    .catch(()=>{});
}

async function findAndFillLoginIn(page, scope) {
  const s = scope || page;
  // différents noms/attributs rencontrés sur les sites FR
  const emailSel = [
    'input[type="email"]',
    'input[name="email"]',
    'input[id*="email"]',
    'input[name="username"]',   // parfois username
    'input[id*="login"]'
  ];
  const passSel = [
    'input[type="password"]',
    'input[name="password"]',
    'input[id*="password"]',
    'input[id*="passwd"]'
  ];
  const contBtn = [
    'button:has-text("Continuer")',
    'button:has-text("Suivant")',
    'button:has-text("Connexion")',
    'button:has-text("Se connecter")',
    'button[type="submit"]'
  ];

  // Email
  for (const sel of emailSel) {
    const el = await s.$(sel);
    if (el) { await el.fill(process.env.CSU_EMAIL); console.log("✍️  email rempli via", sel); break; }
  }
  // Mot de passe
  for (const sel of passSel) {
    const el = await s.$(sel);
    if (el) { await el.fill(process.env.CSU_PASS); console.log("✍️  password rempli via", sel); break; }
  }
  // Bouton
  for (const sel of contBtn) {
    const btn = await s.$(sel);
    if (btn) { await btn.click().catch(()=>{}); console.log("🔘 clic bouton via", sel); break; }
  }
}

async function loginCoursesU(page) {
  console.log("➡️ Login: ouverture page");
  // Essaye directement la page de connexion ; si elle change, on tombera sur la home + modale.
  const loginUrls = [
    "https://www.coursesu.com/mon-compte/connexion",
    "https://www.coursesu.com/connexion",
    "https://www.coursesu.com/"
  ];
  for (const url of loginUrls) {
    await page.goto(url, { waitUntil: "domcontentloaded" }).catch(()=>{});
    await clickConsentIfAny(page);
    console.log("🔗 URL actuelle:", page.url());
    await screenshot(page, "after-goto");
    // Si on est sur la home, tente d’ouvrir la modale
    if (page.url().includes("coursesu.com/") && !page.url().includes("connexion")) {
      await page.click('text=Se connecter, [href*="connexion"]', { timeout: 8000 }).catch(()=>{});
      await page.waitForTimeout(1000);
    }

    // 1) Tentative directe dans la page
    await findAndFillLoginIn(page);

    // 2) Tentative via iframe (modale embarquée)
    const frames = page.frames();
    for (const fr of frames) {
      try {
        const hasEmail = await fr.$('input[type="email"], input[name="email"], input[name="username"]');
        if (hasEmail) {
          console.log("🧩 Formulaire trouvé dans un iframe");
          await findAndFillLoginIn(page, fr);
        }
      } catch {}
    }

    // Attendre que ça charge (si authent OK on voit souvent ‘mon espace’/avatar)
    await page.waitForLoadState("networkidle").catch(()=>{});
    const logged = await page.$('text=Mon espace, [href*="mon-espace"], img[alt*="compte"], [aria-label*="compte"]');
    if (logged) { console.log("✅ Login semble OK"); return; }
  }
  await screenshot(page, "login-failed");
  throw new Error("Impossible de trouver/remplir le formulaire de login (timeout/selecteurs).");
}
