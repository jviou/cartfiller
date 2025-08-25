import { chromium } from "playwright";

const HEADLESS = process.env.HEADFUL ? false : true;

/* ---------- utils ---------- */
async function screenshot(page, tag) {
  try {
    const p = `/tmp/${Date.now()}-${tag}.png`;
    await page.screenshot({ path: p, fullPage: true });
    console.log("🖼  Screenshot:", p);
  } catch (e) { console.log("⚠️ Screenshot KO:", e.message); }
}

async function clickConsentIfAny(page) {
  await page
    .click('button:has-text("Tout accepter"), button:has-text("Accepter"), [id*="didomi"] button, [id*="tarteaucitron"] button:has-text("OK")',
      { timeout: 3000 })
    .catch(()=>{});
}

async function findAndFillLoginIn(scope) {
  const emailSel = [
    'input[type="email"]','input[name="email"]','input[id*="email"]',
    'input[name="username"]','input[id*="login"]'
  ];
  const passSel  = [
    'input[type="password"]','input[name="password"]','input[id*="password"]','input[id*="passwd"]'
  ];
  const contBtn  = [
    'button:has-text("Continuer")','button:has-text("Suivant")',
    'button:has-text("Connexion")','button:has-text("Se connecter")','button[type="submit"]'
  ];

  for (const sel of emailSel) {
    const el = await scope.$(sel);
    if (el) { await el.fill(process.env.CSU_EMAIL); console.log("✍️  email via", sel); break; }
  }
  for (const sel of passSel) {
    const el = await scope.$(sel);
    if (el) { await el.fill(process.env.CSU_PASS); console.log("✍️  pass via", sel); break; }
  }
  for (const sel of contBtn) {
    const btn = await scope.$(sel);
    if (btn) { await btn.click().catch(()=>{}); console.log("🔘 bouton via", sel); break; }
  }
}

async function loginCoursesU(page) {
  console.log("➡️ Login CoursesU");
  const urls = [
    "https://www.coursesu.com/mon-compte/connexion",
    "https://www.coursesu.com/connexion",
    "https://www.coursesu.com/"
  ];
  for (const u of urls) {
    await page.goto(u, { waitUntil: "domcontentloaded" }).catch(()=>{});
    await clickConsentIfAny(page);
    console.log("🔗 URL:", page.url());
    if (!page.url().includes("connexion")) {
      await page.click('text=Se connecter, a[href*="connexion"]', { timeout: 8000 }).catch(()=>{});
      await page.waitForTimeout(800);
    }

    // direct
    await findAndFillLoginIn(page);

    // iframes (modale)
    for (const fr of page.frames()) {
      try {
        const hasEmail = await fr.$('input[type="email"], input[name="email"], input[name="username"]');
        if (hasEmail) {
          console.log("🧩 Formulaire dans iframe");
          await findAndFillLoginIn(fr);
        }
      } catch {}
    }

    await page.waitForLoadState("networkidle").catch(()=>{});
    const logged = await page.$('a[href*="mon-espace"], [aria-label*="compte"], img[alt*="compte"]');
    if (logged) { console.log("✅ Login OK"); return; }
  }
  await screenshot(page, "login-failed");
  throw new Error("Login CoursesU échoué (sélecteurs/timeout).");
}

/* ---------- principal ---------- */
export async function addListsToCart(listNames = []) {
  console.log("➡️ Lancement Playwright (headless:", HEADLESS, ")");
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();
  const added = [];
  const notFound = [];

  try {
    await loginCoursesU(page);

    console.log("➡️ Aller sur Mes listes…");
    await page.goto("https://www.coursesu.com/mon-espace/mes-listes", { waitUntil: "networkidle" });

    for (const wantedRaw of listNames) {
      const wanted = (wantedRaw || "").trim();
      const wantedLc = wanted.toLowerCase();
      console.log(`🔎 Liste recherchée: ${wanted}`);

      const cards = await page.$$("section, article, div");
      let clicked = false;

      for (const card of cards) {
        const text = ((await card.textContent()) || "").toLowerCase();
        if (!text.includes(wantedLc)) continue;

        const addBtn =
          (await card.$('button[aria-label*="panier"]')) ||
          (await card.$('button:has(svg), button:has(i), button'));

        if (addBtn) {
          console.log(`🛒 Clic 'Ajouter au panier' pour '${wanted}'`);
          await addBtn.click().catch(()=>{ console.log("⚠️ clic échoué"); });
          await page.click('button:has-text("Confirmer"), button:has-text("Ajouter")', { timeout: 2500 }).catch(()=>{});
          added.push(wanted);
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        console.log(`❌ Liste introuvable: ${wanted}`);
        notFound.push(wanted);
      }
    }

    // total panier
    let total = null;
    try {
      total =
        (await page.textContent('[data-test="basket-total"]')) ||
        (await page.textContent(".cart__total"));
    } catch { console.log("⚠️ total panier introuvable"); }

    console.log("✅ Terminé");
    await browser.close();
    return { added, notFound, total };
  } catch (e) {
    console.error("💥 Erreur:", e.message);
    await screenshot(page, "fatal");
    await browser.close();
    throw e;
  }
}

