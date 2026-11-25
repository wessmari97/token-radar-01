// Token Radar's plain dashboard, model radar-2. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer with the
// model's own inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function (radar-2): the page recomputes a row from the snapshot figures and
  // checks the number board.json carries, so the page's code and the board's data are visibly the
  // same arithmetic. Diminishing returns on TVL, stronger growth momentum, a maturity premium for
  // running years with no token, and a small chain-diversity factor.
  function impliedOf(row, model) {
    var sizeRaw = Math.pow(row.tvl_usd / model.tvl_reference_usd, -model.tvl_dampening);
    var sizeMult = Math.min(model.size_cap, Math.max(model.size_floor, sizeRaw));
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainCount = Math.max(0, (row.chains ? row.chains.length : 0) - 1);
    var chainMult = 1 + Math.min(chainCount, model.chain_cap) * model.chain_step;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * sizeMult * growthMult * maturity * chainMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the actions, the capital, the hold and every cost and time. No name is special-cased.
  // Two of the six steps are category-specific: the main action and a follow-up, so the plan reads as
  // something done to this protocol, not a generic checklist.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  var ACTIONS = [
    ['risk curator', function (n, c, ch) { return 'Deposit $' + c + ' of USDC into a ' + n + ' curator vault on ' + ch + ' and keep the vault shares.'; }],
    ['onchain capital allocator', function (n, c, ch) { return 'Allocate $' + c + ' of USDC to a ' + n + ' allocator vault on ' + ch + ' and keep the shares.'; }],
    ['curator', function (n, c, ch) { return 'Deposit $' + c + ' of USDC into a ' + n + ' curator vault on ' + ch + ' and keep the vault shares.'; }],
    ['allocator', function (n, c, ch) { return 'Allocate $' + c + ' of USDC to a ' + n + ' allocator vault on ' + ch + ' and keep the shares.'; }],
    ['uncollateralized lending', function (n, c, ch) { return 'Supply $' + c + " of USDC to " + n + "'s lending pool on " + ch + ' and keep the position open.'; }],
    ['lending', function (n, c, ch) { return 'Supply $' + c + ' of USDC to ' + n + ' on ' + ch + ' and keep the position open.'; }],
    ['cdp', function (n, c, ch) { return 'Lock $' + c + ' of collateral in ' + n + ' on ' + ch + ' and mint its stable asset against it.'; }],
    ['collateral', function (n, c, ch) { return 'Lock $' + c + ' of collateral in ' + n + ' on ' + ch + ' and keep the position open.'; }],
    ['leveraged farm', function (n, c, ch) { return 'Open a $' + c + ' leveraged farming position on ' + n + ' on ' + ch + ' and keep it open.'; }],
    ['yield aggregator', function (n, c, ch) { return 'Deposit $' + c + ' of USDC into a ' + n + ' yield vault on ' + ch + ' and keep the shares.'; }],
    ['liquidity manager', function (n, c, ch) { return 'Deposit $' + c + ' of USDC into a ' + n + ' managed liquidity position on ' + ch + '.'; }],
    ['yield', function (n, c, ch) { return 'Deposit $' + c + " of USDC into " + n + "'s highest-yield vault on " + ch + ' and keep the shares.'; }],
    ['farm', function (n, c, ch) { return 'Deposit $' + c + " of USDC into " + n + "'s main farm on " + ch + ' and keep the position open.'; }],
    ['dex', function (n, c, ch) { return 'Provide $' + c + " of liquidity to " + n + "'s main pool on " + ch + ' and keep the position open.'; }],
    ['canonical bridge', function (n, c, ch) { return 'Bridge $' + c + ' of USDC to ' + ch + ' through ' + n + "'s canonical bridge and use the bridged funds in its app."; }],
    ['cross chain bridge', function (n, c, ch) { return 'Bridge $' + c + ' of USDC to ' + ch + ' through ' + n + ' and use the bridged funds in its app.'; }],
    ['bridge', function (n, c, ch) { return 'Bridge $' + c + ' of USDC to ' + ch + ' through ' + n + ' and use the bridged funds in its app.'; }],
    ['liquid restaking', function (n, c, ch) { return 'Restake $' + c + " of the chain's staking asset through " + n + ' and keep the liquid restaking receipt.'; }],
    ['liquid staking', function (n, c, ch) { return 'Stake $' + c + " of the chain's staking asset through " + n + ' and keep the liquid staking receipt.'; }],
    ['restaking', function (n, c, ch) { return 'Restake $' + c + " of the chain's staking asset through " + n + ' and keep the receipt.'; }],
    ['staking pool', function (n, c, ch) { return 'Stake $' + c + " of the chain's staking asset in " + n + "'s pool on " + ch + ' and keep the receipt.'; }],
    ['perpetual', function (n, c, ch) { return 'Deposit $' + c + ' of USDC as margin on ' + n + ' and open one small hedge.'; }],
    ['derivative', function (n, c, ch) { return 'Deposit $' + c + ' of USDC as margin on ' + n + ' and open one small position.'; }],
    ['options', function (n, c, ch) { return 'Buy one $' + c + ' covered option position on ' + n + ' and hold it to expiry.'; }],
    ['interest rate', function (n, c, ch) { return 'Deposit $' + c + ' of USDC into ' + n + "'s rate market on " + ch + ' and keep the position open.'; }],
    ['prediction', function (n, c, ch) { return 'Fund $' + c + ' and place one market position on ' + n + '.'; }],
    ['basis trading', function (n, c, ch) { return 'Open a $' + c + ' basis trade on ' + n + ' and hold both legs open.'; }],
    ['rwa', function (n, c, ch) { return 'Mint $' + c + " of the protocol's yield asset on " + ch + ' and hold it.'; }],
    ['stablecoin', function (n, c, ch) { return 'Mint or deposit $' + c + ' of the stable asset through ' + n + ' on ' + ch + '.'; }],
    ['algo-stable', function (n, c, ch) { return 'Mint $' + c + ' of the stable asset through ' + n + ' on ' + ch + ' and hold it.'; }],
    ['dual-token', function (n, c, ch) { return 'Mint $' + c + ' of the stable asset through ' + n + ' on ' + ch + ' and hold it.'; }],
    ['insurance', function (n, c, ch) { return 'Buy $' + c + ' of cover from ' + n + ' on ' + ch + ' and keep the policy.'; }],
    ['payments', function (n, c, ch) { return 'Load $' + c + ' onto ' + n + "'s payment flow on " + ch + ' and make one real payment.'; }],
    ['crypto card', function (n, c, ch) { return 'Load $' + c + ' onto a ' + n + ' card on ' + ch + ' and spend it once.'; }],
    ['governance incentive', function (n, c, ch) { return 'Lock $' + c + ' of the governance asset in ' + n + ' on ' + ch + ' and cast one vote.'; }],
    ['launchpad', function (n, c, ch) { return 'Stake $' + c + ' in ' + n + "'s launchpad on " + ch + ' and join one sale.'; }],
    ['index', function (n, c, ch) { return 'Buy $' + c + ' of the ' + n + ' index on ' + ch + ' and hold it.'; }],
    ['nft marketplace', function (n, c, ch) { return 'List one item for sale on ' + n + ' on ' + ch + ' and keep the listing live.'; }],
    ['privacy', function (n, c, ch) { return 'Deposit $' + c + ' into ' + n + "'s shielded pool on " + ch + ' and keep the position open.'; }],
    ['ai agent', function (n, c, ch) { return 'Fund $' + c + ' and run one paid task through ' + n + ' on ' + ch + '.'; }],
    ['decentralized ai', function (n, c, ch) { return 'Fund $' + c + ' and run one paid task through ' + n + ' on ' + ch + '.'; }],
    ['token locker', function (n, c, ch) { return 'Lock $' + c + ' of tokens in ' + n + ' on ' + ch + ' for the shortest term it offers.'; }],
    ['reserve currency', function (n, c, ch) { return 'Bond $' + c + ' of USDC into ' + n + ' on ' + ch + ' and keep the bond.'; }],
    ['anchor btc', function (n, c, ch) { return 'Deposit $' + c + ' of BTC into ' + n + ' on ' + ch + ' and keep the receipt.'; }],
    ['decentralized btc', function (n, c, ch) { return 'Deposit $' + c + ' of BTC into ' + n + ' on ' + ch + ' and keep the receipt.'; }],
    ['restaked btc', function (n, c, ch) { return 'Restake $' + c + ' of BTC through ' + n + ' and keep the receipt.'; }],
    ['chain', function (n, c, ch) { return 'Bridge $' + c + ' of USDC to ' + ch + " through " + n + "'s own bridge and use one app on the chain."; }]
  ];
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    for (var i = 0; i < ACTIONS.length; i++) {
      if (c.indexOf(ACTIONS[i][0]) >= 0) return ACTIONS[i][1](p.name, capital, chain);
    }
    return 'Deposit $' + capital + ' of USDC into ' + p.name + ' on ' + chain + ' and keep the position open.';
  }
  var FOLLOW_UPS = [
    ['risk curator', function (n, c, ch) { return 'Rebalance once: move $' + Math.round(c / 2) + ' between two ' + n + ' vaults on ' + ch + '.'; }],
    ['onchain capital allocator', function (n, c, ch) { return 'Reallocate $' + Math.round(c / 2) + ' between two ' + n + ' vaults on ' + ch + '.'; }],
    ['curator', function (n, c, ch) { return 'Rebalance once: move $' + Math.round(c / 2) + ' between two ' + n + ' vaults on ' + ch + '.'; }],
    ['allocator', function (n, c, ch) { return 'Reallocate $' + Math.round(c / 2) + ' between two ' + n + ' vaults on ' + ch + '.'; }],
    ['lending', function (n, c, ch) { return 'Borrow $' + Math.round(c / 4) + ' against the position on ' + n + ' and repay it the same week.'; }],
    ['cdp', function (n, c, ch) { return 'Mint $' + Math.round(c / 4) + ' of the stable asset against the collateral and hold it.'; }],
    ['collateral', function (n, c, ch) { return 'Add $' + Math.round(c / 4) + ' more collateral to the ' + n + ' position on ' + ch + '.'; }],
    ['dex', function (n, c, ch) { return 'Swap $' + Math.round(c / 4) + ' through ' + n + "'s main pool on " + ch + '.'; }],
    ['yield', function (n, c, ch) { return "Claim the vault's yield once and redeposit it into the same " + n + ' vault.'; }],
    ['farm', function (n, c, ch) { return "Harvest the farm's rewards once and restake them in " + n + '.'; }],
    ['bridge', function (n, c, ch) { return 'Bridge $' + Math.round(c / 4) + ' back through ' + n + ' so the round trip is on record.'; }],
    ['staking', function (n, c, ch) { return 'Delegate a second, smaller stake of $' + Math.round(c / 4) + ' through ' + n + '.'; }],
    ['restaking', function (n, c, ch) { return 'Restake a second, smaller amount of $' + Math.round(c / 4) + ' through ' + n + '.'; }],
    ['perpetual', function (n, c, ch) { return 'Close the hedge and open a fresh one of the same size on ' + n + '.'; }],
    ['derivative', function (n, c, ch) { return 'Close the position and open a fresh one of the same size on ' + n + '.'; }],
    ['options', function (n, c, ch) { return 'Roll the option into the next expiry on ' + n + '.'; }],
    ['prediction', function (n, c, ch) { return 'Settle one market position on ' + n + ' and place a second one.'; }],
    ['basis trading', function (n, c, ch) { return "Rebalance the basis trade's legs once on " + n + '.'; }],
    ['rwa', function (n, c, ch) { return "Claim the yield asset's accrued yield once and hold the receipt."; }],
    ['stablecoin', function (n, c, ch) { return 'Swap $' + Math.round(c / 4) + ' of the stable asset for USDC and back on ' + ch + '.'; }],
    ['insurance', function (n, c, ch) { return 'File one test claim on the ' + n + ' policy to confirm the cover is live.'; }],
    ['payments', function (n, c, ch) { return 'Make a second payment of $' + Math.round(c / 4) + ' through ' + n + '.'; }],
    ['governance incentive', function (n, c, ch) { return 'Vote on a second proposal through ' + n + '.'; }],
    ['launchpad', function (n, c, ch) { return "Claim the first sale's allocation and stake it back in " + n + '.'; }],
    ['index', function (n, c, ch) { return 'Rebalance the ' + n + ' index holding once.'; }],
    ['chain', function (n, c, ch) { return 'Use a second app on ' + ch + ' with the bridged funds.'; }]
  ];
  function followUpFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    for (var i = 0; i < FOLLOW_UPS.length; i++) {
      if (c.indexOf(FOLLOW_UPS[i][0]) >= 0) return FOLLOW_UPS[i][1](p.name, capital, chain);
    }
    return 'Make one more qualifying action on ' + p.name + ', such as a swap, a deposit or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: followUpFor(p, capital, chain), cost: 'about $' + Math.round(capital / 4) + ' of capital moved and about $2 of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, then write the wallet, the dates and every transaction in a farm log.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  // The board at a glance: four aggregate figures computed from the rows, so the reader
  // sees the board's scale before the table. Total TVL and total implied value say how big
  // the radar's universe is; the median age says how long these protocols have run with no
  // token; the top ten's share says whether the value is concentrated in a few names or
  // spread across the board. All four are recomputed from DATA, never typed in.
  function statsRow() {
    var rows = DATA.rows;
    var totalTvl = rows.reduce(function (s, r) { return s + r.tvl_usd; }, 0);
    var totalImplied = rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var ages = rows.map(function (r) { return r.age_days; }).filter(function (a) { return a !== null; }).sort(function (a, b) { return a - b; });
    var medianAge = ages.length ? ages[Math.floor(ages.length / 2)] : null;
    var topTenImplied = rows.slice(0, 10).reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var topTenShare = totalImplied ? Math.round((topTenImplied / totalImplied) * 100) : 0;
    return el('section', { class: 'panel stats', 'aria-label': 'Board at a glance' },
      el('div', { class: 'stat' },
        el('span', { class: 'sub', text: 'Combined TVL on the board' }),
        el('b', { class: 'num', text: fmtUsd(totalTvl) })
      ),
      el('div', { class: 'stat' },
        el('span', { class: 'sub', text: 'Combined implied value' }),
        el('b', { class: 'num', text: fmtUsd(totalImplied) })
      ),
      el('div', { class: 'stat' },
        el('span', { class: 'sub', text: 'Median age with no token' }),
        el('b', { class: 'num', text: medianAge === null ? 'n/a' : fmtAge(medianAge) })
      ),
      el('div', { class: 'stat' },
        el('span', { class: 'sub', text: 'Top 10 share of implied value' }),
        el('b', { class: 'num', text: topTenShare + '%' })
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x size x growth x maturity x chains )'
      ),
      el('div', { class: 'formula' },
        'size = clamp( (tvl_usd / $' + (m.tvl_reference_usd / 1e9) + 'B) ^ -' + m.tvl_dampening + ', ' + m.size_floor + ', ' + m.size_cap + ' )  —  diminishing returns on TVL, so the board is a ranking, not a TVL list'
      ),
      el('div', { class: 'formula' },
        'growth = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + '  —  momentum matters: up 11% in a week scores 1.13x, down 28% scores 0.66x'
      ),
      el('div', { class: 'formula' },
        'maturity = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + '  —  a premium for running up to four years with no token'
      ),
      el('div', { class: 'formula' },
        'chains = 1 + min(chains - 1, ' + m.chain_cap + ') x ' + m.chain_step + '  —  wider reach, up to 1.18x'
      ),
      el('p', { class: 'sub', text: 'TVL, seven-day growth, age and chain count come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is the 160 pre-token protocols below the watchlist floor with the highest implied value, and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  // Where the board's value sits, by category: for every category on the board, how many
  // protocols it holds, their combined TVL, their combined implied value, and the strongest
  // protocol in it. The table answers "which kind of protocol is this radar mostly about"
  // without opening a single row, and it is computed from the board, never hand-written.
  function categoryPanel() {
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var cat = r.category || 'Other';
      var slot = byCat[cat];
      if (!slot) slot = byCat[cat] = { count: 0, tvl: 0, implied: 0, top: null };
      slot.count += 1;
      slot.tvl += r.tvl_usd;
      slot.implied += r.implied_value_usd;
      if (!slot.top || r.implied_value_usd > slot.top.implied_value_usd) slot.top = r;
    });
    var cats = Object.keys(byCat).map(function (cat) {
      var s = byCat[cat];
      return { cat: cat, count: s.count, tvl: s.tvl, implied: s.implied, top: s.top };
    });
    cats.sort(function (a, b) { return b.implied - a.implied; });
    var maxImplied = cats.length ? cats[0].implied : 1;
    var tbody = el('tbody');
    cats.forEach(function (c) {
      var tr = el('tr', null,
        el('td', null, el('b', { text: c.cat })),
        el('td', { class: 'num', text: String(c.count) }),
        el('td', { class: 'num', text: fmtUsd(c.tvl) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((c.implied / maxImplied) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(c.implied) })
        )),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: c.top.name }),
          el('span', { class: 'sub', text: 'rank #' + c.top.rank + ' · ' + fmtUsd(c.top.implied_value_usd) })
        ))
      );
      tbody.appendChild(tr);
    });
    return el('section', { class: 'panel categories', 'aria-label': 'Value by category' },
      el('h2', { text: 'Where the value sits' }),
      el('p', { class: 'sub', text: 'The board grouped by category. Risk curators and allocators dominate because they hold the most TVL with no token; a category with one huge protocol and nothing else is a concentration, not a theme.' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Categories on the board, strongest combined implied value first.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Protocols' }),
            el('th', { scope: 'col', text: 'Combined TVL' }),
            el('th', { scope: 'col', text: 'Combined implied value' }),
            el('th', { scope: 'col', text: 'Strongest protocol' })
          )),
          tbody
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String(row.chains ? row.chains.length : 0) })),
        el('div', null, el('span', { text: 'Size multiplier' }), el('b', { class: 'num', text: String(row.size_multiplier) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  // The week's fastest growers among the pre-token protocols, from DATA.movers: a strip of
  // ten cards, each showing the seven-day TVL change, the implied value, and the board rank
  // when the protocol is on the board. Clicking a card opens the same detail drawer as the
  // board row, so the strip and the table never disagree.
  function moversStrip() {
    var movers = DATA.movers || [];
    if (movers.length === 0) return null;
    var cards = movers.map(function (m) {
      var rank = m.board_rank === null ? 'off the board' : 'board #' + m.board_rank;
      return el('article', {
        class: 'mover',
        tabindex: '0',
        onclick: function () { if (m.board_rank !== null) openDetail(m.slug); },
        onkeydown: function (e) { if ((e.key === 'Enter' || e.key === ' ') && m.board_rank !== null) { e.preventDefault(); openDetail(m.slug); } }
      },
        el('div', { class: 'mover-top' },
          el('b', { text: m.name }),
          el('span', { class: 'num pos', text: '+' + fmtPct(m.change_7d) })
        ),
        el('div', { class: 'sub', text: (m.category || 'Other') + ' · ' + fmtUsd(m.tvl_usd) + ' TVL' }),
        el('div', { class: 'mover-bottom' },
          el('span', { class: 'num', text: fmtUsd(m.implied_value_usd) }),
          el('span', { class: 'sub', text: rank })
        )
      );
    });
    return el('section', { class: 'panel movers', 'aria-label': 'Top movers this week' },
      el('div', { class: 'movers-head' },
        el('h2', { text: 'Top movers this week' }),
        el('p', { class: 'sub', text: 'Pre-token protocols by seven-day TVL growth, over $5m TVL. Growth is momentum, not a promise: a spike can be one deposit.' })
      ),
      el('div', { class: 'mover-grid' }, cards)
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(statsRow());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') shell.appendChild(moversStrip());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(categoryPanel());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
