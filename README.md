# Postman + Newman · Retail Store Ops API

[![Newman API tests](https://github.com/mukeshn/postman-newman-retail-api/actions/workflows/newman.yml/badge.svg)](https://github.com/mukeshn/postman-newman-retail-api/actions/workflows/newman.yml)
[![Live report](https://img.shields.io/badge/htmlextra-report-2ea44f?logo=postman)](https://mukeshn.github.io/postman-newman-retail-api/)
![Postman](https://img.shields.io/badge/Postman-collection%20v2.1-FF6C37?logo=postman&logoColor=white)
![Newman](https://img.shields.io/badge/Newman-6-orange)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Postman collection for a retail store operations backend (store finder, inventory, CSV import/export, click & collect). It runs headless in CI with Newman, and the **htmlextra** report is published to GitHub Pages.

> Import `collections/retail-store-ops.postman_collection.json` and `environments/local.postman_environment.json` into Postman to explore it interactively.

| Folder | Requests | Techniques |
|---|---|---|
| Stores | list, nearest by geo, 404 | chaining (`storeId`), sort-order assertion |
| Inventory | read, receive, negative stock, invalid reason, CSV import/export | JSON schema (`pm.response.to.have.jsonSchema`), variables between requests |
| Click & Collect | reserve, wrong code, hand over, double hand-over, unavailable | pre-request scripts for unique data, state machine checks |

A collection-level test enforces a **1s response-time budget** on every request.

```mermaid
stateDiagram-v2
  [*] --> RESERVED: POST /click-collect
  RESERVED --> RESERVED: wrong pickup code (403)
  RESERVED --> COLLECTED: correct code
  COLLECTED --> COLLECTED: second hand-over (409)
```

```bash
npm ci
npm run sut &     # bundled API on :4173
npm test          # cli + htmlextra (reports/index.html) + junit
```
