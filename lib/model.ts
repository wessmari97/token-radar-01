// The token radar's model, version 2: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. The early
// rows are the 160 with the highest implied value, not the 160 largest by TVL, so the board is the
// 200 pre-token protocols the model values most. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value follows only from the snapshot's own figures. The starter's model was nearly a TVL
// sort: its base was TVL times a constant and its growth and maturity terms were too small to reorder
// anything. This model gives each of the four signals real weight, so a smaller protocol that is
// growing fast, has run a long time with no token, and reaches many chains can outrank a larger,
// shrinking one:
//
//   size      = tvl_usd
//   sizeFactor = clamp( (tvl_usd / 1e9) ^ -0.15, 0.5, 2.0 )   -- diminishing returns on TVL:
//                 a protocol ten times smaller is scored at ~1.4x its TVL share, one ten times larger
//                 at ~0.7x, so the board is a ranking, not a TVL list
//   base       = tvl_usd x 0.25 x sizeFactor
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x 1.2                        -- momentum matters: a protocol up
//                 11% in a week scores 1.13x, one down 28% scores 0.66x
//   maturity   = 0.7 + min(age_days, 1460) / 1460 x 0.5          -- a premium for having run up to
//                 four years with no token (age unknown: 365 days)
//   chains     = 1 + min(chains - 1, 10) x 0.02                 -- wider reach, up to 1.18x
//   implied    = max(1, round(base x growthMult x maturity x chains))
//
// No protocol name is ever special-cased: the same function scores every row, and the dashboard
// states the formula and recomputes each row from the snapshot figures.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  tvl_reference_usd: number;
  tvl_dampening: number;
  size_floor: number;
  size_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_cap: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  tvl_reference_usd: 1_000_000_000,
  tvl_dampening: 0.15,
  size_floor: 0.5,
  size_cap: 2.0,
  growth_weight: 1.2,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.7,
  maturity_range: 0.5,
  maturity_days: 1460,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_cap: 10,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by implied value. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    size_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  size_multiplier: number;
  chain_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One row of the dashboard's Top Movers strip: the fastest-growing pre-token protocols. */
export interface MoverRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number;
  age_days: number | null;
  implied_value_usd: number;
  board_rank: number | null;
}

/** How many movers the strip carries, and the TVL floor that keeps a tiny pool's spike out. */
export const MOVER_ROWS = 10;
export const MOVER_MIN_TVL_USD = 5_000_000;

/**
 * The week's fastest growers among the pre-token protocols: ranked by their seven-day TVL change,
 * with a TVL floor so a $10k pool's 300% jump does not outrank a real protocol's 40% climb. A
 * mover's board rank is attached when it is on the board, so the strip and the board agree.
 */
export function topMovers(snapshot: Snapshot, board: BoardRow[]): MoverRow[] {
  const rankBySlug = new Map(board.map((r) => [r.slug, r.rank]));
  const impliedBySlug = new Map(board.map((r) => [r.slug, r.implied_value_usd]));
  return snapshot.protocols
    .filter((p) => isRankable(p) && p.change_7d !== null && p.tvl_usd >= MOVER_MIN_TVL_USD)
    .map((p) => ({
      p,
      growth: p.change_7d as number,
      age: ageDays(snapshot.as_of, p.listed_at),
    }))
    .sort((a, b) => b.growth - a.growth || b.p.tvl_usd - a.p.tvl_usd)
    .slice(0, MOVER_ROWS)
    .map(({ p, growth, age }) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: growth,
      age_days: age,
      implied_value_usd: impliedBySlug.get(p.slug) ?? impliedValue(p, snapshot.as_of, MODEL).implied,
      board_rank: rankBySlug.get(p.slug) ?? null,
    }));
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  movers: MoverRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The five multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; sizeMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const sizeRaw = Math.pow(protocol.tvl_usd / model.tvl_reference_usd, -model.tvl_dampening);
  const sizeMult = Math.min(model.size_cap, Math.max(model.size_floor, sizeRaw));
  const chainCount = Math.max(0, protocol.chains.length - 1);
  const chainMult = 1 + Math.min(chainCount, model.chain_cap) * model.chain_step;
  const base = protocol.tvl_usd * model.base_multiple * sizeMult;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult));
  return { implied, growthPct, growthMult, maturityMult, sizeMult, chainMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by implied value, capped. The
  // board ranks by implied value, so the early rows it carries are the 160 with the highest implied
  // value — a small protocol with strong growth and years without a token can outrank a larger,
  // stagnant one, and a TVL cut would have left it off the board entirely. Never a replacement for
  // a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, implied: impliedValue(p, snapshot.as_of, model).implied }))
    .sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const { p } of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, sizeMult, chainMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, growthPct, growthMult, maturityMult, sizeMult, chainMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      size_multiplier: round4(s.sizeMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * One category's main action, as a function of the protocol's name, capital and first chain.
 * The list is checked in order; the first keyword that matches the category wins. Nothing here
 * names a protocol: the same table serves every row.
 */
type ActionFn = (name: string, capital: number, chain: string) => string;
const ACTIONS: [string, ActionFn][] = [
  ['risk curator', (n, c, ch) => `Deposit $${c} of USDC into a ${n} curator vault on ${ch} and keep the vault shares.`],
  ['onchain capital allocator', (n, c, ch) => `Allocate $${c} of USDC to a ${n} allocator vault on ${ch} and keep the shares.`],
  ['curator', (n, c, ch) => `Deposit $${c} of USDC into a ${n} curator vault on ${ch} and keep the vault shares.`],
  ['allocator', (n, c, ch) => `Allocate $${c} of USDC to a ${n} allocator vault on ${ch} and keep the shares.`],
  ['uncollateralized lending', (n, c, ch) => `Supply $${c} of USDC to ${n}'s lending pool on ${ch} and keep the position open.`],
  ['lending', (n, c, ch) => `Supply $${c} of USDC to ${n} on ${ch} and keep the position open.`],
  ['cdp', (n, c, ch) => `Lock $${c} of collateral in ${n} on ${ch} and mint its stable asset against it.`],
  ['collateral', (n, c, ch) => `Lock $${c} of collateral in ${n} on ${ch} and keep the position open.`],
  ['leveraged farm', (n, c, ch) => `Open a $${c} leveraged farming position on ${n} on ${ch} and keep it open.`],
  ['yield aggregator', (n, c, ch) => `Deposit $${c} of USDC into a ${n} yield vault on ${ch} and keep the shares.`],
  ['liquidity manager', (n, c, ch) => `Deposit $${c} of USDC into a ${n} managed liquidity position on ${ch}.`],
  ['yield', (n, c, ch) => `Deposit $${c} of USDC into ${n}'s highest-yield vault on ${ch} and keep the shares.`],
  ['farm', (n, c, ch) => `Deposit $${c} of USDC into ${n}'s main farm on ${ch} and keep the position open.`],
  ['dex', (n, c, ch) => `Provide $${c} of liquidity to ${n}'s main pool on ${ch} and keep the position open.`],
  ['canonical bridge', (n, c, ch) => `Bridge $${c} of USDC to ${ch} through ${n}'s canonical bridge and use the bridged funds in its app.`],
  ['cross chain bridge', (n, c, ch) => `Bridge $${c} of USDC to ${ch} through ${n} and use the bridged funds in its app.`],
  ['bridge', (n, c, ch) => `Bridge $${c} of USDC to ${ch} through ${n} and use the bridged funds in its app.`],
  ['liquid restaking', (n, c, ch) => `Restake $${c} of the chain's staking asset through ${n} and keep the liquid restaking receipt.`],
  ['liquid staking', (n, c, ch) => `Stake $${c} of the chain's staking asset through ${n} and keep the liquid staking receipt.`],
  ['restaking', (n, c, ch) => `Restake $${c} of the chain's staking asset through ${n} and keep the receipt.`],
  ['staking pool', (n, c, ch) => `Stake $${c} of the chain's staking asset in ${n}'s pool on ${ch} and keep the receipt.`],
  ['perpetual', (n, c, ch) => `Deposit $${c} of USDC as margin on ${n} and open one small hedge.`],
  ['derivative', (n, c, ch) => `Deposit $${c} of USDC as margin on ${n} and open one small position.`],
  ['options', (n, c, ch) => `Buy one $${c} covered option position on ${n} and hold it to expiry.`],
  ['interest rate', (n, c, ch) => `Deposit $${c} of USDC into ${n}'s rate market on ${ch} and keep the position open.`],
  ['prediction', (n, c, ch) => `Fund $${c} and place one market position on ${n}.`],
  ['basis trading', (n, c, ch) => `Open a $${c} basis trade on ${n} and hold both legs open.`],
  ['rwa', (n, c, ch) => `Mint $${c} of the protocol's yield asset on ${ch} and hold it.`],
  ['stablecoin', (n, c, ch) => `Mint or deposit $${c} of the stable asset through ${n} on ${ch}.`],
  ['algo-stable', (n, c, ch) => `Mint $${c} of the stable asset through ${n} on ${ch} and hold it.`],
  ['dual-token', (n, c, ch) => `Mint $${c} of the stable asset through ${n} on ${ch} and hold it.`],
  ['insurance', (n, c, ch) => `Buy $${c} of cover from ${n} on ${ch} and keep the policy.`],
  ['payments', (n, c, ch) => `Load $${c} onto ${n}'s payment flow on ${ch} and make one real payment.`],
  ['crypto card', (n, c, ch) => `Load $${c} onto a ${n} card on ${ch} and spend it once.`],
  ['governance incentive', (n, c, ch) => `Lock $${c} of the governance asset in ${n} on ${ch} and cast one vote.`],
  ['launchpad', (n, c, ch) => `Stake $${c} in ${n}'s launchpad on ${ch} and join one sale.`],
  ['index', (n, c, ch) => `Buy $${c} of the ${n} index on ${ch} and hold it.`],
  ['nft marketplace', (n, c, ch) => `List one item for sale on ${n} on ${ch} and keep the listing live.`],
  ['privacy', (n, c, ch) => `Deposit $${c} into ${n}'s shielded pool on ${ch} and keep the position open.`],
  ['ai agent', (n, c, ch) => `Fund $${c} and run one paid task through ${n} on ${ch}.`],
  ['decentralized ai', (n, c, ch) => `Fund $${c} and run one paid task through ${n} on ${ch}.`],
  ['token locker', (n, c, ch) => `Lock $${c} of tokens in ${n} on ${ch} for the shortest term it offers.`],
  ['reserve currency', (n, c, ch) => `Bond $${c} of USDC into ${n} on ${ch} and keep the bond.`],
  ['anchor btc', (n, c, ch) => `Deposit $${c} of BTC into ${n} on ${ch} and keep the receipt.`],
  ['decentralized btc', (n, c, ch) => `Deposit $${c} of BTC into ${n} on ${ch} and keep the receipt.`],
  ['restaked btc', (n, c, ch) => `Restake $${c} of BTC through ${n} and keep the receipt.`],
  ['chain', (n, c, ch) => `Bridge $${c} of USDC to ${ch} through ${n}'s own bridge and use one app on the chain.`],
];

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  for (const [keyword, fn] of ACTIONS) {
    if (c.includes(keyword)) return fn(p.name, capital, chain);
  }
  return `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`;
}

/**
 * One category's follow-up qualifying action: the second thing a farmer does, so the plan is not
 * one deposit and a wait. Checked in the same order as the main actions.
 */
const FOLLOW_UPS: [string, ActionFn][] = [
  ['risk curator', (n, c, ch) => `Rebalance once: move $${Math.round(c / 2)} between two ${n} vaults on ${ch}.`],
  ['onchain capital allocator', (n, c, ch) => `Reallocate $${Math.round(c / 2)} between two ${n} vaults on ${ch}.`],
  ['curator', (n, c, ch) => `Rebalance once: move $${Math.round(c / 2)} between two ${n} vaults on ${ch}.`],
  ['allocator', (n, c, ch) => `Reallocate $${Math.round(c / 2)} between two ${n} vaults on ${ch}.`],
  ['lending', (n, c, ch) => `Borrow $${Math.round(c / 4)} against the position on ${n} and repay it the same week.`],
  ['cdp', (n, c, ch) => `Mint $${Math.round(c / 4)} of the stable asset against the collateral and hold it.`],
  ['collateral', (n, c, ch) => `Add $${Math.round(c / 4)} more collateral to the ${n} position on ${ch}.`],
  ['dex', (n, c, ch) => `Swap $${Math.round(c / 4)} through ${n}'s main pool on ${ch}.`],
  ['yield', (n, c, ch) => `Claim the vault's yield once and redeposit it into the same ${n} vault.`],
  ['farm', (n, c, ch) => `Harvest the farm's rewards once and restake them in ${n}.`],
  ['bridge', (n, c, ch) => `Bridge $${Math.round(c / 4)} back through ${n} so the round trip is on record.`],
  ['staking', (n, c, ch) => `Delegate a second, smaller stake of $${Math.round(c / 4)} through ${n}.`],
  ['restaking', (n, c, ch) => `Restake a second, smaller amount of $${Math.round(c / 4)} through ${n}.`],
  ['perpetual', (n, c, ch) => `Close the hedge and open a fresh one of the same size on ${n}.`],
  ['derivative', (n, c, ch) => `Close the position and open a fresh one of the same size on ${n}.`],
  ['options', (n, c, ch) => `Roll the option into the next expiry on ${n}.`],
  ['prediction', (n, c, ch) => `Settle one market position on ${n} and place a second one.`],
  ['basis trading', (n, c, ch) => `Rebalance the basis trade's legs once on ${n}.`],
  ['rwa', (n, c, ch) => `Claim the yield asset's accrued yield once and hold the receipt.`],
  ['stablecoin', (n, c, ch) => `Swap $${Math.round(c / 4)} of the stable asset for USDC and back on ${ch}.`],
  ['insurance', (n, c, ch) => `File one test claim on the ${n} policy to confirm the cover is live.`],
  ['payments', (n, c, ch) => `Make a second payment of $${Math.round(c / 4)} through ${n}.`],
  ['governance incentive', (n, c, ch) => `Vote on a second proposal through ${n}.`],
  ['launchpad', (n, c, ch) => `Claim the first sale's allocation and stake it back in ${n}.`],
  ['index', (n, c, ch) => `Rebalance the ${n} index holding once.`],
  ['chain', (n, c, ch) => `Use a second app on ${ch} with the bridged funds.`],
];

function followUpFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  for (const [keyword, fn] of FOLLOW_UPS) {
    if (c.includes(keyword)) return fn(p.name, capital, chain);
  }
  return `Make one more qualifying action on ${p.name}, such as a swap, a deposit or a vote.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * Two of the six steps are category-specific: the main action and a follow-up, so the plan reads as
 * something done to this protocol, not a generic checklist.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const followUp = followUpFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: followUp,
      cost: `about $${Math.round(capital / 4)} of capital moved and about $2 of gas`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, then write the wallet, the dates and every transaction in a farm log.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    size_multiplier: row.model.size_multiplier,
    chain_multiplier: row.model.chain_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const movers = topMovers(snapshot, board);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    movers,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
