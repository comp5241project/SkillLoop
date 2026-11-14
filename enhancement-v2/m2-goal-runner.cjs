/** Bounded, restart-safe local M2-06B experiment driver. No I/O on import. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { prepareOutputDirectory, DEFAULT_MODEL, DEFAULT_PRICE_CEILING, LIVE_TOKEN } =
  require('./m2-openrouter-provider.cjs');
const { runOfflineEvaluation } = require('./m2-offline-evaluation.cjs');

const CAMPAIGN_ID = 'm2-06b-real-evaluation';
const V2_SMOKE_CAMPAIGN_ID = 'm2-06b-contract-v2-smoke';
const V2_SMOKE_OPT_IN = 'AUTHORIZE_M2_06B_V2_SMOKE';
const LOCAL_BUDGET_USD = 0.10;
const LOCK_NAME = '.m2-06b-real-evaluation.lock';
const SCENARIOS = new Set(['student-a', 'student-b', 'reviewed-paraphrase']);
const RECORD_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/;
const coded = (code) => Object.assign(new Error(code), { code });

async function readLedger(directory, campaignId = CAMPAIGN_ID) {
  if (![CAMPAIGN_ID, V2_SMOKE_CAMPAIGN_ID].includes(campaignId))
    throw coded('INVALID_EXPERIMENT_REQUEST');
  const records = [];
  for (const name of await fs.readdir(directory)) {
    if (!RECORD_NAME.test(name)) continue;
    if (!(await fs.lstat(path.join(directory, name))).isFile())
      throw coded('EXPERIMENT_LEDGER_UNVERIFIABLE');
    const record = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
    if (`${record.candidateId}.json` !== name || !SCENARIOS.has(record.scenario) ||
        !Number.isInteger(record.attempts) || record.attempts < 1 || record.attempts > 2 ||
        record.billingComplete !== true || !Array.isArray(record.attemptBilling) ||
        record.attemptBilling.length !== record.attempts ||
        record.attemptBilling.some((event) => !event.usage ||
          typeof event.billedCostUsd !== 'number' || !Number.isFinite(event.billedCostUsd) ||
          event.billedCostUsd < 0) ||
        typeof record.billedCostUsd !== 'number' || !Number.isFinite(record.billedCostUsd) ||
        record.billedCostUsd < 0 ||
        Math.abs(record.attemptBilling.reduce((sum, event) => sum + event.billedCostUsd, 0) -
          record.billedCostUsd) > 1e-9 ||
        record.campaignId && ![CAMPAIGN_ID, V2_SMOKE_CAMPAIGN_ID].includes(record.campaignId))
      throw coded('EXPERIMENT_LEDGER_UNVERIFIABLE');
    records.push(record);
  }
  const campaign = records.filter((record) => record.campaignId === campaignId);
  return { historicalGenerations: records.length - campaign.length,
    generations: campaign.length, attempts: campaign.reduce((sum, record) => sum + record.attempts, 0),
    spentUsd: records.reduce((sum, record) => sum + record.billedCostUsd, 0),
    scenarioCounts: Object.fromEntries([...SCENARIOS].map((scenario) =>
      [scenario, campaign.filter((record) => record.scenario === scenario).length])),
    scenarioOutcomes: Object.fromEntries([...SCENARIOS].map((scenario) =>
      [scenario, campaign.filter((record) => record.scenario === scenario)
        .map((record) => record.generationStatus)])) };
}

async function verifyLivePreflight(env) {
  if (env.SKILLLOOP_M2_LIVE_OPT_IN !== LIVE_TOKEN ||
      env.SKILLLOOP_M2_ACCOUNT_CAP_USD !== '1' ||
      env.SKILLLOOP_M2_PRICE_VERIFIED_DATE !== new Date().toISOString().slice(0, 10) ||
      !env.OPENROUTER_API_KEY?.trim()) throw coded('LIVE_PREFLIGHT_INCOMPLETE');
  const [keyResponse, routeResponse] = await Promise.all([
    fetch('https://openrouter.ai/api/v1/key',
      { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` }, redirect: 'error' }),
    fetch(`https://openrouter.ai/api/v1/models/${DEFAULT_MODEL}/endpoints`, { redirect: 'error' }),
  ]);
  if (!keyResponse.ok || !routeResponse.ok) throw coded('LIVE_PREFLIGHT_HTTP_FAILED');
  const key = (await keyResponse.json()).data;
  const route = (await routeResponse.json()).data;
  if (!key || key.disabled === true || key.is_management_key === true ||
      typeof key.limit !== 'number' || key.limit > 1 || key.limit <= 0 ||
      typeof key.limit_remaining !== 'number' || key.limit_remaining < 0.05 ||
      route?.id !== DEFAULT_MODEL || !Array.isArray(route.endpoints))
    throw coded('LIVE_PREFLIGHT_REJECTED');
  const ceiling = DEFAULT_PRICE_CEILING;
  const eligible = route.endpoints.filter((endpoint) => {
    const parameters = endpoint.supported_parameters || [];
    const price = endpoint.pricing || {};
    if (endpoint.status !== 0 || !['reasoning', 'max_tokens', 'response_format', 'structured_outputs']
      .every((parameter) => parameters.includes(parameter)) ||
      Object.keys(price).some((name) => !['prompt', 'completion', 'input_cache_read', 'discount', 'overrides']
        .includes(name))) return false;
    const rates = [price, ...(Array.isArray(price.overrides) ? price.overrides : [])];
    return rates.every((rate) => ['prompt', 'completion'].every((name) =>
      Number.isFinite(Number(rate[name])) && Number(rate[name]) >= 0 &&
      Number(rate[name]) * 1e6 <= ceiling[name] + 1e-12) &&
      (rate.input_cache_read === undefined ||
        Number.isFinite(Number(rate.input_cache_read)) && Number(rate.input_cache_read) >= 0 &&
        Number(rate.input_cache_read) * 1e6 <= ceiling.cacheRead + 1e-12));
  });
  if (eligible.length < 1) throw coded('MODEL_ROUTE_UNVERIFIED');
  return { keyLimitUsd: key.limit, keyRemainingUsd: key.limit_remaining,
    eligibleRoutes: eligible.length, checkedUtcDate: new Date().toISOString().slice(0, 10) };
}

async function runGoalSingle({ mode, scenario, campaignId = CAMPAIGN_ID,
  outputDirectory, env = process.env, fetchImpl } = {}) {
  if (!['fake', 'live'].includes(mode) || !SCENARIOS.has(scenario) ||
      ![CAMPAIGN_ID, V2_SMOKE_CAMPAIGN_ID].includes(campaignId))
    throw coded('INVALID_EXPERIMENT_REQUEST');
  if (mode === 'live' && campaignId === V2_SMOKE_CAMPAIGN_ID &&
      env.SKILLLOOP_M2_V2_SMOKE_OPT_IN !== V2_SMOKE_OPT_IN)
    throw coded('V2_SMOKE_OPT_IN_REQUIRED');
  const directory = await prepareOutputDirectory(outputDirectory, { requirePrivate: mode === 'live' });
  const preflight = mode === 'live' ? await verifyLivePreflight(env) : null;
  const lockPath = path.join(directory, LOCK_NAME);
  const lock = await fs.open(lockPath, 'wx', 0o600);
  await lock.writeFile(JSON.stringify({ campaignId,
    reservedScenario: scenario, startedAt: new Date().toISOString() }));
  await lock.sync();
  await lock.close();
  let settled = false;
  try {
    const before = await readLedger(directory, campaignId);
    const v2 = campaignId === V2_SMOKE_CAMPAIGN_ID;
    if (v2 && scenario !== 'student-a' && before.scenarioOutcomes['student-a'][0] !== 'success') {
      settled = true; // No transport has started.
      throw coded('V2_A_NOT_VALIDATED');
    }
    if (before.generations >= (v2 ? 3 : 9) || before.attempts >= (v2 ? 3 : 18) ||
        before.scenarioCounts[scenario] >= (v2 ? 1 : 3) ||
        before.spentUsd + 0.05 > LOCAL_BUDGET_USD + 1e-12) {
      settled = true; // The transport cannot have started.
      throw coded('EXPERIMENT_LIMIT_REACHED');
    }
    const remainingBudgetUsd = LOCAL_BUDGET_USD - before.spentUsd;
    const summary = await runOfflineEvaluation({ mode, fetchImpl, env, model: DEFAULT_MODEL,
      smoke: true, smokeScenario: scenario, campaignId, repetitions: 1,
      budgetUsd: remainingBudgetUsd, outputDirectory: directory,
      liveOptIn: mode === 'live' ? LIVE_TOKEN : null });
    const after = await readLedger(directory, campaignId);
    if (summary.attemptedCalls !== 1 || after.generations !== before.generations + 1 ||
        after.attempts !== before.attempts + 1 ||
        after.scenarioCounts[scenario] !== before.scenarioCounts[scenario] + 1 ||
        after.spentUsd > LOCAL_BUDGET_USD + 1e-12)
      throw coded('EXPERIMENT_SETTLEMENT_UNVERIFIABLE');
    settled = true;
    return { ...summary, cumulative: after, preflight };
  } finally {
    // An uncertain request or crash retains the lock and blocks subsequent paid calls.
    if (settled) await fs.unlink(lockPath);
  }
}

module.exports = { runGoalSingle, readLedger, verifyLivePreflight,
  CAMPAIGN_ID, V2_SMOKE_CAMPAIGN_ID, V2_SMOKE_OPT_IN };
