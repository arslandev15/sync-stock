import fetch from 'node-fetch';

// ── All your credentials ──────────────────────────────────────
const CONFIG = {
  beehiveApiKey: process.env.BEEHIVE_API_KEY,
  beehiveBase: process.env.BEEHIVE_BASE,
  shopifyStore: process.env.SHOPIFY_STORE,
  shopifyToken: process.env.SHOPIFY_TOKEN,
  locationId: Number(process.env.LOCATION_ID)
};

// ── Beehive API calls ─────────────────────────────────────────
async function getBeehiveStock() {
  const res = await fetch(`${CONFIG.beehiveBase}/api/stock`, {
    headers: { 'x-api-key': CONFIG.beehiveApiKey }
  });
  const data = await res.json();
  return data.products;
}

async function getBeehiveRestock() {
  const res = await fetch(`${CONFIG.beehiveBase}/api/restock`, {
    headers: { 'x-api-key': CONFIG.beehiveApiKey }
  });
  const data = await res.json();
  return data.products;
}

// ── Shopify API calls ─────────────────────────────────────────
async function shopifyGet(path) {
  const res = await fetch(
    `https://${CONFIG.shopifyStore}/admin/api/2024-01/${path}`,
    { headers: { 'X-Shopify-Access-Token': CONFIG.shopifyToken } }
  );
  return res.json();
}

async function shopifyPut(path, body) {
  const res = await fetch(
    `https://${CONFIG.shopifyStore}/admin/api/2024-01/${path}`,
    {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': CONFIG.shopifyToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );
  return res.json();
}

async function shopifyPost(path, body) {
  const res = await fetch(
    `https://${CONFIG.shopifyStore}/admin/api/2024-01/${path}`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': CONFIG.shopifyToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );
  return res.json();
}

async function shopifyDelete(path) {
  await fetch(
    `https://${CONFIG.shopifyStore}/admin/api/2024-01/${path}`,
    {
      method: 'DELETE',
      headers: { 'X-Shopify-Access-Token': CONFIG.shopifyToken }
    }
  );
}

// ── Fetch ALL Shopify products with pagination ────────────────
async function getAllShopifyProducts() {
  let allProducts = [];
  let url = `https://${CONFIG.shopifyStore}/admin/api/2024-01/products.json?limit=250&fields=id,handle,variants`;

  while (url) {
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': CONFIG.shopifyToken }
    });
    const data = await res.json();
    allProducts = allProducts.concat(data.products || []);

    const link = res.headers.get('link') || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }

  return allProducts;
}

// ── Update stock quantity ─────────────────────────────────────
async function updateInventory(inventoryItemId, qty) {
  return shopifyPost('inventory_levels/set.json', {
    location_id:       CONFIG.locationId,
    inventory_item_id: inventoryItemId,
    available:         qty
  });
}

// ── Generic: fetch metafields for any owner (product or variant) ──
async function fetchMetafields(ownerPath) {
  const { metafields } = await shopifyGet(`${ownerPath}/metafields.json`);
  return metafields || [];
}

// ── Generic: set restock metafields on any owner ──────────────
async function setRestockMetafieldsOn(ownerPath, ownerLabel, restockDate, restockQty) {
  const metafields = await fetchMetafields(ownerPath);

  console.log(
    `🔍 Metafields on ${ownerLabel}:`,
    metafields.length
      ? metafields.map(m => `${m.namespace}.${m.key} [${m.id}]`).join(', ')
      : 'none found'
  );

  // Key by field name, namespace-agnostic
  const existing = {};
  for (const mf of metafields) {
    existing[mf.key] = mf;
  }

  // ── next_restock_date ─────────────────────────────────────
  if (existing['next_restock_date']) {
    const res = await shopifyPut(`metafields/${existing['next_restock_date'].id}.json`, {
      metafield: {
        id:    existing['next_restock_date'].id,
        value: restockDate,
        // type:  'date'
      }
    });
    if (res.metafield) {
      console.log(`   📅 [${ownerLabel}] next_restock_date → ${res.metafield.value}`);
    } else {
      console.log(`   ❌ [${ownerLabel}] next_restock_date failed:`, JSON.stringify(res));
    }
  } else {
    // Metafield doesn't exist yet — create it
    console.log(`   ⚠️  [${ownerLabel}] next_restock_date metafield not found — creating...`);
    const res = await shopifyPost(`${ownerPath}/metafields.json`, {
      metafield: {
        namespace: 'custom',
        key:       'next_restock_date',
        value:     restockDate,
        type:      'date'
      }
    });
    if (res.metafield) {
      console.log(`   📅 [${ownerLabel}] next_restock_date created → ${res.metafield.value}`);
    } else {
      console.log(`   ❌ [${ownerLabel}] next_restock_date create failed:`, JSON.stringify(res));
    }
  }

  // ── next_restock_quantity ─────────────────────────────────
  if (existing['next_restock_quantity']) {
    const res = await shopifyPut(`metafields/${existing['next_restock_quantity'].id}.json`, {
      metafield: {
        id:    existing['next_restock_quantity'].id,
        value: String(restockQty),
        // type:  'integer'
      }
    });
    if (res.metafield) {
      console.log(`   📦 [${ownerLabel}] next_restock_quantity → ${res.metafield.value}`);
    } else {
      console.log(`   ❌ [${ownerLabel}] next_restock_quantity failed:`, JSON.stringify(res));
    }
  } else {
    // Metafield doesn't exist yet — create it
    console.log(`   ⚠️  [${ownerLabel}] next_restock_quantity metafield not found — creating...`);
    const res = await shopifyPost(`${ownerPath}/metafields.json`, {
      metafield: {
        namespace: 'custom',
        key:       'next_restock_quantity',
        value:     String(restockQty),
        type:      'number_integer'
      }
    });
    if (res.metafield) {
      console.log(`   📦 [${ownerLabel}] next_restock_quantity created → ${res.metafield.value}`);
    } else {
      console.log(`   ❌ [${ownerLabel}] next_restock_quantity create failed:`, JSON.stringify(res));
    }
  }
}

// ── Generic: clear restock metafields on any owner ────────────
async function clearRestockMetafieldsOn(ownerPath, ownerLabel) {
  const metafields = await fetchMetafields(ownerPath);

  let cleared = false;
  for (const mf of metafields) {
    if (mf.key === 'next_restock_date' || mf.key === 'next_restock_quantity') {
      await shopifyDelete(`metafields/${mf.id}.json`);
      console.log(`   🗑  [${ownerLabel}] Cleared ${mf.namespace}.${mf.key}`);
      cleared = true;
    }
  }
  if (!cleared) {
    console.log(`   ✅ [${ownerLabel}] No restock metafields to clear`);
  }
}

// ── Determine if a product has "real" variants ────────────────
// Shopify always has at least 1 variant (the default "Title" variant).
// A product is considered multi-variant only if it has more than one variant
// OR if the sole variant has a non-default option value.
function isMultiVariant(shopifyProduct) {
  return shopifyProduct.variants.length > 1;
}

// ── Main sync function ────────────────────────────────────────
async function runSync() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔄 Sync started: ${new Date().toISOString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Fetch Beehive data
  console.log('\n📦 Fetching Beehive stock + restock feeds...');
  const [stockItems, restockItems] = await Promise.all([
    getBeehiveStock(),
    getBeehiveRestock()
  ]);
  console.log(`Stock items: ${stockItems.length}`);
  console.log(`Restock items: ${restockItems.length}`);

  // 2. Build restock lookup by normalised SKU
  const restockBySku = {};
  for (const p of restockItems) {
    for (const sku of p.skus) {
      restockBySku[sku.trim().toLowerCase()] = p;
    }
  }

  // 3. Fetch all Shopify products (paginated)
  console.log('\n🛒 Fetching Shopify products...');
  const products = await getAllShopifyProducts();
  console.log(`Shopify products found: ${products.length}`);

  // 4. Build SKU map AND handle map
  //    Each entry now carries variantId + variantCount so we know
  //    whether to update product-level or variant-level metafields.
  const shopifyBySku    = {};
  const shopifyByHandle = {};

  for (const product of products) {
    const variantCount = product.variants.length;

    for (const variant of product.variants) {
      if (variant.sku) {
        const normSku = variant.sku.trim().toLowerCase();
        shopifyBySku[normSku] = {
          productId:       product.id,
          variantId:       variant.id,
          inventoryItemId: variant.inventory_item_id,
          variantCount,          // how many variants this product has
          originalSku:     variant.sku
        };
      }
    }

    if (product.handle && product.variants.length > 0) {
      shopifyByHandle[product.handle] = {
        productId:       product.id,
        variantId:       product.variants[0].id,
        inventoryItemId: product.variants[0].inventory_item_id,
        variantCount
      };
    }
  }

  // 5. For multi-variant products we need to know the stock state of ALL
  //    variants before deciding whether to touch product-level metafields.
  //    Build a per-product stock summary from the Beehive stock feed.
  //    key: productId → { totalVariants, inStockVariants, outVariants[] }
  const productStockSummary = {};

  for (const item of stockItems) {
    const normSku = item.sku.trim().toLowerCase();
    const match   = shopifyBySku[normSku];
    if (!match) continue;

    const { productId, variantCount } = match;
    if (!productStockSummary[productId]) {
      productStockSummary[productId] = {
        totalVariants:   variantCount,
        seenVariants:    0,
        inStockVariants: 0
      };
    }
    productStockSummary[productId].seenVariants++;
    if (item.available) productStockSummary[productId].inStockVariants++;
  }

  // 6. Loop and sync
  console.log('\n🔁 Syncing...\n');
  let updated = 0, skipped = 0;

  for (const item of stockItems) {
    const normSku = item.sku.trim().toLowerCase();

    // Pass 1: match by normalised SKU
    let match = shopifyBySku[normSku];

    // Pass 2: derive handle from SKU and try handle map
    if (!match) {
      const derivedHandle = normSku.replace(/_/g, '-');
      match = shopifyByHandle[derivedHandle];
      if (match) {
        console.log(`⚡ SKU→handle fallback: "${item.sku}" → "${derivedHandle}"`);
      }
    }

    if (!match) {
      console.log(`⚠️  Not in Shopify — skipping SKU: ${item.sku}`);
      skipped++;
      continue;
    }

    const { productId, variantId, inventoryItemId, variantCount } = match;
    const multiVariant = variantCount > 1;

    // ── Update inventory quantity ─────────────────────────────
    await updateInventory(inventoryItemId, item.stock_level);

    const restock = restockBySku[normSku];

    if (!item.available && restock?.next_restock_date) {
      // ── Out of stock + restock info ───────────────────────
      console.log(`🔴 ${item.sku}`);
      console.log(
        `   Stock: 0 | Restock: ${restock.next_restock_date}` +
        (restock.next_restock_quantity ? ` (${restock.next_restock_quantity} units)` : ' (qty TBD)')
      );

      if (multiVariant) {
        // Update VARIANT-level metafields for this specific SKU
        await setRestockMetafieldsOn(
          `variants/${variantId}`,
          `variant ${variantId} (${item.sku})`,
          restock.next_restock_date,
          restock.next_restock_quantity
        );

        // Update PRODUCT-level metafields only when ALL tracked variants
        // are out of stock (so the product-level badge is accurate).
        const summary = productStockSummary[productId];
        const allOut  = summary && summary.inStockVariants === 0;
        if (allOut) {
          // Use the soonest restock date across all out-of-stock variants
          // (simplest approach: just use the current item's date; if you
          //  want the minimum, you'd need a second aggregation pass).
          console.log(`   ↳ All variants out — updating product ${productId} metafields too`);
          await setRestockMetafieldsOn(
            `products/${productId}`,
            `product ${productId}`,
            restock.next_restock_date,
            restock.next_restock_quantity
          );
        }

      } else {
        // Single-variant product — update product-level metafields only
        await setRestockMetafieldsOn(
          `products/${productId}`,
          `product ${productId} (${item.sku})`,
          restock.next_restock_date,
          restock.next_restock_quantity
        );
      }

    } else if (!item.available) {
      // ── Out of stock, no restock date ─────────────────────
      console.log(`🔴 ${item.sku} — Out of stock, no restock date`);

    } else {
      // ── Back in stock — clear restock metafields ──────────
      console.log(`🟢 ${item.sku} — In stock: ${item.stock_level} units`);

      if (multiVariant) {
        // Always clear this variant's metafields
        await clearRestockMetafieldsOn(
          `variants/${variantId}`,
          `variant ${variantId} (${item.sku})`
        );

        // Clear product-level metafields only when at least one variant
        // is now back in stock (product is no longer fully OOS).
        const summary = productStockSummary[productId];
        const anyInStock = summary && summary.inStockVariants > 0;
        if (anyInStock) {
          console.log(`   ↳ At least one variant in stock — clearing product ${productId} metafields`);
          await clearRestockMetafieldsOn(
            `products/${productId}`,
            `product ${productId}`
          );
        }

      } else {
        // Single-variant product
        await clearRestockMetafieldsOn(
          `products/${productId}`,
          `product ${productId} (${item.sku})`
        );
      }
    }

    updated++;
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Sync complete!`);
  console.log(`Updated: ${updated} | Skipped: ${skipped}`);
  console.log(`⏱  Finished: ${new Date().toISOString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

runSync().catch(console.error);
