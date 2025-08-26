const express = require("express");
const { chromium } = require("playwright");

const HEADLESS = process.env.HEADFUL ? false : true;

/* --- helpers login --- */
async function clickConsentIfAny(page) {
  await page.click('button:has-text("Tout accepter"), button:has-text("Accepter")', { timeout: 3000 }).catch(()=>{});
}

async function tryFill(scope, selList, value) {
  for (const sel of selList) { const el = await scope.$(sel); if (el) { await el.fill(value); return sel; } }
  return null;
}
async function tryClick(scope, selList) {
  for (const sel of selList) { const el = await scope.$(sel); if (el) { await el.click().catch(()=>{}); return sel; } }
  return null;
}

async function loginCoursesU(page) {
  const urls = [
    "https://www.coursesu.com/mon-compte/connexion",
    "https://www.coursesu.com/connexion",
    "https://www.coursesu.com/"
  ];
  for (const u of urls) {
    await page.goto(u, { waitUntil: "domcontentloaded" }).catch(()=>{});
    await clickConsentIfAny(page);
    if (!page.url().includes("connexion")) {
      await page.click('text=Se connecter, a[href*="connexion"]', { timeout: 8000 }).catch(()=>{});
      await page.waitForTimeout(800);
    }
    const emailSel = ['input[type="email"]','input[name="email"]','input[name="username"]','input[id*="email"]','input[id*="login"]'];
    const passSel  = ['input[type="password"]','input[name="password"]','input[id*="password"]','input[id*="passwd"]'];
    const btnSel   = ['button:has-text("Se connecter")','button:has-text("Connexion")','button:has-text("Continuer")','button[type="submit"]'];

    await tryFill(page, emailSel, process.env.CSU_EMAIL || "");
    await tryClick(page, ['button:has-text("Continuer")']).catch(()=>{});
    await tryFill(page, passSel, process.env.CSU_PASS || "");
    await tryClick(page, btnSel);

    // essaie aussi les iframes
    for (const fr of page.frames()) {
      const has = await fr.$('input[type="email"], input[name="email"], input[name="username"]').catch(()=>null);
      if (has) {
        await tryFill(fr, emailSel, process.env.CSU_EMAIL || "");
        await tryFill(fr, passSel,  process.env.CSU_PASS  || "");
        await tryClick(fr, btnSel);
      }
    }

    await page.waitForLoadState("networkidle").catch(()=>{});
    const logged = await page.$('a[href*="mon-espace"], [aria-label*="compte"], img[alt*="compte"]').catch(()=>null);
    if (logged) return;
  }
  throw new Error("Login CoursesU échoué (sélecteurs/timeout).");
}

/* --- action principale --- */
async function addListsToCart(listNames = []) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const page = await browser.newPage();
  const added = [], notFound = [];
  try {
    await loginCoursesU(page);
    await page.goto("https://www.coursesu.com/mon-espace/mes-listes", { waitUntil: "networkidle" });

    for (const wantedRaw of listNames) {
      const wanted = (wantedRaw || "").trim(); const lc = wanted.toLowerCase();
      let clicked = false;
      const cards = await page.$$("section, article, div");

      for (const card of cards) {
        const txt = ((await card.textContent()) || "").toLowerCase();
        if (!txt.includes(lc)) continue;
        const btn = (await card.$('button[aria-label*="panier"]')) ||
                    (await card.$('button:has(svg), button:has(i), button'));
        if (btn) { await btn.click().catch(()=>{}); clicked = true; break; }
      }
      clicked ? added.push(wanted) : notFound.push(wanted);
    }

    let total = null;
    try { total = (await page.textContent('[data-test="basket-total"]')) || (await page.textContent(".cart__total")); } catch {}
    await browser.close();
    return { added, notFound, total };
  } catch (e) {
    await browser.close();
    throw e;
  }
}

/* --- serveur HTTP --- */
const app = express();
app.use(express.json());
app.get("/health", (req,res) => res.json({ ok: true, ts: Date.now() }));
app.post("/add-lists", async (req, res) => {
  try {
    const lists = Array.isArray(req.body?.lists) ? req.body.lists : [];
    const result = await addListsToCart(lists);
    res.json({ ok: true, result });
  } catch (e) {
    console.error("ERROR:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`🚀 CartFiller listening on ${port}`));
