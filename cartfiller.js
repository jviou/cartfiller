/* CartFiller — Express + Playwright (CommonJS, headless forcé) */
const express = require("express");
const { chromium } = require("playwright");

/* ------------------ utils ------------------ */
async function clickConsentIfAny(page) {
  await page
    .click('button:has-text("Tout accepter"), button:has-text("Accepter")', { timeout: 3000 })
    .catch(() => {});
}
async function tryFill(scope, selectors, value) {
  for (const s of selectors) { const el = await scope.$(s); if (el) { await el.fill(value); return s; } }
  return null;
}
async function tryClick(scope, selectors) {
  for (const s of selectors) { const el = await scope.$(s); if (el) { await el.click().catch(()=>{}); return s; } }
  return null;
}

/* ------------------ login ------------------ */
async function loginCoursesU(page) {
  const urls = [
    "https://www.coursesu.com/mon-compte/connexion",
    "https://www.coursesu.com/connexion",
    "https://www.coursesu.com/"
  ];
  for (const u of urls) {
    console.log("[LOGIN] goto:", u);
    await page.goto(u, { waitUntil: "domcontentloaded" }).catch(()=>{});
    await clickConsentIfAny(page);
    if (!page.url().includes("connexion")) {
      await page.click('text=Se connecter, a[href*="connexion"]', { timeout: 8000 }).catch(()=>{});
      await page.waitForTimeout(800);
    }
    const emailSel = ['input[type="email"]','input[name="email"]','input[name="username"]','input[id*="email"]','input[id*="login"]'];
    const passSel  = ['input[type="password"]','input[name="password"]','input[id*="password"]','input[id*="passwd"]'];
    const btnSel   = ['button:has-text("Se connecter")','button:has-text("Connexion")','button:has-text("Continuer")','button[type="submit"]'];

    if (process.env.CSU_EMAIL) await tryFill(page, emailSel, process.env.CSU_EMAIL);
    await tryClick(page, ['button:has-text("Continuer")']);
    if (process.env.CSU_PASS) await tryFill(page, passSel, process.env.CSU_PASS);
    await tryClick(page, btnSel);

    for (const fr of page.frames()) {
      const has = await fr.$('input[type="email"], input[name="email"], input[name="username"]').catch(()=>null);
      if (has) {
        if (process.env.CSU_EMAIL) await tryFill(fr, emailSel, process.env.CSU_EMAIL);
        if (process.env.CSU_PASS)  await tryFill(fr, passSel,  process.env.CSU_PASS);
        await tryClick(fr, btnSel);
      }
    }

    await page.waitForLoadState("networkidle").catch(()=>{});
    const logged = await page.$('a[href*="mon-espace"], [aria-label*="compte"], img[alt*="compte"]').catch(()=>null);
    if (logged) { console.log("[LOGIN] success"); return; }
  }
  throw new Error("Login CoursesU échoué (sélecteurs/timeout).");
}

/* -------------- action principale -------------- */
async function addListsToCart(listNames = []) {
  // DRY_RUN pour tester facilement la tuyauterie côté API
  if (process.env.DRY_RUN) {
    console.log("[DRY_RUN] active — pas de lancement navigateur");
    return { added: listNames, notFound: [], total: null, dryRun: true };
  }

  console.log("[PW] launch headless: true");
  const browser = await chromium.launch({ headless: true }); // ← headless forcé
  const page = await browser.newPage();
  const added = [], notFound = [];
  try {
    await loginCoursesU(page);

    console.log("[LISTES] goto Mes listes");
    await page.goto("https://www.coursesu.com/mon-espace/mes-listes", { waitUntil: "networkidle" });

    for (const raw of listNames) {
      const wanted = (raw || "").trim(), lc = wanted.toLowerCase();
      console.log("[LISTES] chercher:", wanted);
      let clicked = false;

      const cards = await page.$$("section, article, div");
      for (const card of cards) {
        const txt = ((await card.textContent()) || "").toLowerCase();
        if (!txt.includes(lc)) continue;
        const btn = (await card.$('button[aria-label*="panier"]')) ||
                    (await card.$('button:has(svg), button:has(i), button'));
        if (btn) {
          console.log("[LISTES] click panier:", wanted);
          await btn.click().catch(()=>{});
          await page.click('button:has-text("Confirmer"), button:has-text("Ajouter")', { timeout: 2500 }).catch(()=>{});
          clicked = true;
          break;
        }
      }
      clicked ? added.push(wanted) : notFound.push(wanted);
    }

    let total = null;
    try {
      total = (await page.textContent('[data-test="basket-total"]')) ||
              (await page.textContent(".cart__total"));
    } catch {}
    await browser.close();
    return { added, notFound, total };
  } catch (e) {
    await browser.close();
    throw e;
  }
}

/* ------------------ serveur HTTP ------------------ */
const app = express();
app.use(express.json());
app.use((req, _res, next) => { console.log(`[REQ] ${req.method} ${req.url} body=`, req.body); next(); });

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.post("/add-lists", async (req, res) => {
  try {
    const lists = Array.isArray(req.body?.lists) ? req.body.lists : [];
    console.log("[ADD] lists =", lists);
    const result = await addListsToCart(lists);
    console.log("[ADD] result =", result);
    res.json({ ok: true, result });
  } catch (e) {
    console.error("[ADD] ERROR:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`🚀 CartFiller listening on ${port}`));
