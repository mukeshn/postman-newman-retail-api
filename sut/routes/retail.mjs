import { send } from '../lib.mjs';

// Retail store operations mock: stores, per-store inventory, click & collect.
const STORES = [
  { id: 'AUG-01', name: 'Augsburg City-Galerie', city: 'Augsburg', lat: 48.3705, lng: 10.9025, open: '09:30', close: '20:00' },
  { id: 'MUC-01', name: 'München Marienplatz', city: 'München', lat: 48.1374, lng: 11.5755, open: '09:30', close: '20:00' },
  { id: 'MUC-02', name: 'München Pasing Arcaden', city: 'München', lat: 48.1497, lng: 11.4614, open: '09:30', close: '20:00' },
  { id: 'STR-01', name: 'Stuttgart Königstraße', city: 'Stuttgart', lat: 48.7784, lng: 9.1800, open: '10:00', close: '20:00' },
  { id: 'BER-01', name: 'Berlin Alexanderplatz', city: 'Berlin', lat: 52.5219, lng: 13.4132, open: '10:00', close: '21:00' },
  { id: 'HAM-01', name: 'Hamburg Mönckebergstraße', city: 'Hamburg', lat: 53.5507, lng: 10.0006, open: '10:00', close: '20:00' },
];
const SKUS = [
  ['RT-100', 'Everyday Sneaker White', 59.95, 10], ['RT-101', 'Everyday Sneaker Black', 59.95, 10], ['RT-200', 'Linen Shirt Sand', 39.95, 8],
  ['RT-201', 'Linen Shirt Navy', 39.95, 8], ['RT-300', 'Recycled Tote Bag', 12.0, 20], ['RT-400', 'Wool Beanie Grey', 19.95, 15],
  ['RT-500', 'Puffer Vest Olive', 89.0, 5], ['RT-600', 'Chino Slim Stone', 49.95, 10],
];
let inventory;
let orders;
function seed() {
  inventory = [];
  STORES.forEach((s, si) => SKUS.forEach(([sku, name, price, reorder], ki) => inventory.push({ storeId: s.id, sku, name, price, reorderPoint: reorder, onHand: (si * 7 + ki * 13) % 40 })));
  orders = [];
}
seed();

export const distanceKm = (a, b) => {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return +(2 * R * Math.asin(Math.sqrt(h))).toFixed(1);
};

export function register(r) {
  r.post('/api/retail/__reset', ({ res }) => { seed(); send(res, 200, { reset: true }); });
  r.get('/api/retail/stores', ({ res, query }) => {
    let list = STORES.map((s) => ({ ...s }));
    const lat = Number(query.get('lat')), lng = Number(query.get('lng'));
    if (query.has('lat') && query.has('lng')) list = list.map((s) => ({ ...s, distanceKm: distanceKm({ lat, lng }, s) })).sort((a, b) => a.distanceKm - b.distanceKm);
    if (query.get('city')) list = list.filter((s) => s.city.toLowerCase() === query.get('city').toLowerCase());
    send(res, 200, { count: list.length, stores: list });
  });
  r.get('/api/retail/stores/:id', ({ res, params }) => { const s = STORES.find((x) => x.id === params.id); s ? send(res, 200, s) : send(res, 404, { error: 'STORE_NOT_FOUND' }); });
  r.get('/api/retail/inventory', ({ res, query }) => {
    let rows = inventory;
    if (query.get('store')) rows = rows.filter((i) => i.storeId === query.get('store'));
    if (query.get('sku')) rows = rows.filter((i) => i.sku === query.get('sku'));
    if (query.get('lowStock') === 'true') rows = rows.filter((i) => i.onHand <= i.reorderPoint);
    const delay = Number(query.get('delayMs') || 0);
    setTimeout(() => send(res, 200, { count: rows.length, items: rows.map((i) => ({ ...i, status: i.onHand === 0 ? 'OUT_OF_STOCK' : i.onHand <= i.reorderPoint ? 'LOW' : 'OK' })) }), Math.min(delay, 5000));
  });
  r.post('/api/retail/inventory/adjust', ({ res, body }) => {
    const row = inventory.find((i) => i.storeId === body.storeId && i.sku === body.sku);
    if (!row) return send(res, 404, { error: 'ITEM_NOT_FOUND' });
    const delta = Number(body.delta);
    if (!Number.isInteger(delta) || delta === 0) return send(res, 422, { error: 'VALIDATION', message: 'delta must be a non-zero integer' });
    if (!['RECEIPT', 'SALE', 'DAMAGE', 'COUNT_CORRECTION'].includes(body.reason)) return send(res, 422, { error: 'VALIDATION', message: 'reason must be RECEIPT, SALE, DAMAGE or COUNT_CORRECTION' });
    if (row.onHand + delta < 0) return send(res, 409, { error: 'NEGATIVE_STOCK', onHand: row.onHand });
    row.onHand += delta;
    send(res, 200, row);
  });
  r.post('/api/retail/inventory/import', ({ res, body }) => {
    // body.csv: "storeId,sku,onHand" lines
    const lines = String(body.csv || '').trim().split(/\r?\n/);
    const header = lines.shift()?.split(',').map((s) => s.trim());
    if (!header || header.join(',') !== 'storeId,sku,onHand') return send(res, 422, { error: 'INVALID_HEADER', expected: 'storeId,sku,onHand' });
    const result = { updated: 0, rejected: [] };
    lines.forEach((line, i) => {
      const [storeId, sku, onHand] = line.split(',').map((s) => s.trim());
      const row = inventory.find((x) => x.storeId === storeId && x.sku === sku);
      const n = Number(onHand);
      if (!row) result.rejected.push({ line: i + 2, reason: `Unknown store/SKU ${storeId}/${sku}` });
      else if (!Number.isInteger(n) || n < 0) result.rejected.push({ line: i + 2, reason: `Invalid quantity "${onHand}"` });
      else { row.onHand = n; result.updated += 1; }
    });
    send(res, 200, result);
  });
  r.get('/api/retail/inventory/export.csv', ({ res, query }) => {
    const rows = inventory.filter((i) => !query.get('store') || i.storeId === query.get('store'));
    send(res, 200, ['storeId,sku,name,onHand,reorderPoint', ...rows.map((i) => `${i.storeId},${i.sku},${i.name},${i.onHand},${i.reorderPoint}`)].join('\n'), { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="inventory-${query.get('store') || 'all'}.csv"` });
  });
  r.post('/api/retail/click-collect', ({ res, body }) => {
    const store = STORES.find((s) => s.id === body.storeId);
    if (!store) return send(res, 422, { error: 'VALIDATION', message: 'storeId is invalid' });
    if (!body.customerName || !/^[^@\s]+@[^@\s]+$/.test(body.email || '')) return send(res, 422, { error: 'VALIDATION', message: 'customerName and email are required' });
    const lines = body.lines || [];
    if (!lines.length) return send(res, 422, { error: 'VALIDATION', message: 'lines must not be empty' });
    for (const l of lines) {
      const row = inventory.find((i) => i.storeId === store.id && i.sku === l.sku);
      if (!row) return send(res, 422, { error: 'VALIDATION', message: `Unknown SKU ${l.sku}` });
      if (row.onHand < l.quantity) return send(res, 409, { error: 'NOT_AVAILABLE_IN_STORE', sku: l.sku, onHand: row.onHand });
    }
    lines.forEach((l) => (inventory.find((i) => i.storeId === store.id && i.sku === l.sku).onHand -= l.quantity));
    const o = { id: `CC-${String(orders.length + 1).padStart(5, '0')}-${Math.floor(Math.random() * 900 + 100)}`, storeId: store.id, storeName: store.name, customerName: body.customerName, email: body.email, lines, status: 'RESERVED', pickupCode: String(Math.floor(100000 + Math.random() * 899999)), createdAt: new Date().toISOString() };
    orders.push(o);
    send(res, 201, o);
  });
  r.get('/api/retail/click-collect/:id', ({ res, params }) => { const o = orders.find((x) => x.id === params.id); o ? send(res, 200, o) : send(res, 404, { error: 'ORDER_NOT_FOUND' }); });
  r.post('/api/retail/click-collect/:id/pickup', ({ res, params, body }) => {
    const o = orders.find((x) => x.id === params.id);
    if (!o) return send(res, 404, { error: 'ORDER_NOT_FOUND' });
    if (o.status !== 'RESERVED') return send(res, 409, { error: 'INVALID_STATE', status: o.status });
    if (body.pickupCode !== o.pickupCode) return send(res, 403, { error: 'WRONG_PICKUP_CODE' });
    o.status = 'COLLECTED';
    send(res, 200, o);
  });
}
