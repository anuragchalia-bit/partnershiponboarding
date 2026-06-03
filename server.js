const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN || 'YOUR_API_TOKEN_HERE';
const ONBOARDING_PIPELINE_ID = 3;

// Custom field keys
const FIELDS = {
  onboardingExec:   '75af04f8c9c1328f55a896b5b5631afd3f361df3',
  partnershipType:  '198fd67d884d82af706920bfb64b6cc7781233bf',
  partnershipPlan:  '6a908a29432b0e9f94fc43426927d5ceb422b8fb',
  partnerID:        'e51f5712d7100adc94f21be0fa944a93e21c0da0',
  aiSensyPlanID:    '195652031db4b3fe41ecd9d12085824758a0adf7',
  partnerPlanID:    'e64235c99fa1b8818872940ca25a2e5527e20c16',
  agreementAck:     '999c9b93863acad52fe9a8b12de300837834385b',
  wabaGroup:        '0bb761dd67df961ec115fcbf02249f1e2470000a',
  onboardingTeam:   'b37ec2ab931ad98d7ad9da130ad81cc2ced3fddb',
  onboardingRemark: '92d223bce20574cb3365adda11b6efddb2272139',
  salesRemark:      '2beeb21c855c7330080b5719583e67f119f0ed5f',
  subDomain:        '8430ed1aa07a1845f662c1f05b4d076ca3f9de5f',
  addOns:           '48dbab2a59b87d883ad9e3091b7ce69a4b8ea938',
  wabaCharges:      '25d241dbf21fac3711f1eb8f97bde454b882fe95',
  onboardingFees:   '5c44e03d22e06f8cefc7ca60b01f3058136140cf',
  leadOrigin:       'ec3c5d5601e95daf1d7e819da94a715adf3efd5a',
  affiliateID:      '4bf9651c393515b8ca3ebda256233d3414b9157d',
};

const OPTION_MAPS = {
  partnershipType: { 70: 'White Label', 71: 'Direct API', 72: 'Ads White Label', 96: 'Prime Plus Partnership' },
  partnershipPlan: { 77: 'Diamond', 78: 'Gold' },
  agreementAck:    { 88: 'Done', 89: 'Pending' },
  wabaGroup:       { 86: 'Done', 87: 'Not Yet' },
  onboardingTeam:  { 84: 'Yes', 85: 'Not Yet' },
  addOns:          { 79: 'Flow Builder', 80: 'CTWA', 81: 'Webhooks', 82: 'Meta Ads iFrame', 83: 'All Integrations' },
};

// ─── DATABASE ────────────────────────────────────────────────────────────────
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'onboarding.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS deals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id         INTEGER NOT NULL,
    deal_title      TEXT,
    deal_owner      TEXT,
    exec_name       TEXT,
    exec_id         INTEGER,
    stage_id        INTEGER,
    stage_name      TEXT,
    status          TEXT,
    won_time        TEXT,
    event_type      TEXT,
    partnership_type TEXT,
    partnership_plan TEXT,
    partner_id      TEXT,
    aisensy_plan_id TEXT,
    partner_plan_id TEXT,
    agreement_ack   TEXT,
    waba_group      TEXT,
    ob_team_looped  TEXT,
    add_ons         TEXT,
    onboarding_fees TEXT,
    waba_charges    TEXT,
    sub_domain      TEXT,
    lead_origin     TEXT,
    affiliate_id    TEXT,
    onboarding_remark TEXT,
    sales_remark    TEXT,
    prev_stage_id   INTEGER,
    deal_created    TEXT,
    last_stage_change TEXT,
    recorded_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_exec_name  ON deals(exec_name);
  CREATE INDEX IF NOT EXISTS idx_status     ON deals(status);
  CREATE INDEX IF NOT EXISTS idx_won_time   ON deals(won_time);
  CREATE INDEX IF NOT EXISTS idx_deal_id    ON deals(deal_id);
`);

const insertDeal = db.prepare(`
  INSERT INTO deals (
    deal_id, deal_title, deal_owner, exec_name, exec_id,
    stage_id, stage_name, status, won_time, event_type,
    partnership_type, partnership_plan, partner_id, aisensy_plan_id, partner_plan_id,
    agreement_ack, waba_group, ob_team_looped, add_ons,
    onboarding_fees, waba_charges, sub_domain, lead_origin, affiliate_id,
    onboarding_remark, sales_remark, prev_stage_id, deal_created, last_stage_change
  ) VALUES (
    @deal_id, @deal_title, @deal_owner, @exec_name, @exec_id,
    @stage_id, @stage_name, @status, @won_time, @event_type,
    @partnership_type, @partnership_plan, @partner_id, @aisensy_plan_id, @partner_plan_id,
    @agreement_ack, @waba_group, @ob_team_looped, @add_ons,
    @onboarding_fees, @waba_charges, @sub_domain, @lead_origin, @affiliate_id,
    @onboarding_remark, @sales_remark, @prev_stage_id, @deal_created, @last_stage_change
  )
`);

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const stageCache = {};

async function getStageName(stageId) {
  if (!stageId) return '';
  if (stageCache[stageId]) return stageCache[stageId];
  try {
    const res  = await fetch(`https://api.pipedrive.com/v1/stages/${stageId}?api_token=${PIPEDRIVE_API_TOKEN}`);
    const json = await res.json();
    stageCache[stageId] = json.data?.name || String(stageId);
  } catch {
    stageCache[stageId] = String(stageId);
  }
  return stageCache[stageId];
}

function resolveEnum(mapKey, raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  return OPTION_MAPS[mapKey]?.[raw] || String(raw);
}

function resolveSet(raw) {
  if (!raw) return '';
  return String(raw).split(',').map(id => OPTION_MAPS.addOns[id.trim()] || id.trim()).join(', ');
}

function parseDeal(deal, prev, eventType) {
  const execObj = deal[FIELDS.onboardingExec];
  const execName = typeof execObj === 'object' ? (execObj?.name || execObj?.email || 'Unassigned') : 'Unassigned';
  const execId   = typeof execObj === 'object' ? (execObj?.id || null) : null;

  return {
    deal_id:           deal.id,
    deal_title:        deal.title || '',
    deal_owner:        deal.user_id?.name || '',
    exec_name:         execName,
    exec_id:           execId,
    stage_id:          deal.stage_id || null,
    stage_name:        '',
    status:            deal.status || '',
    won_time:          deal.won_time || '',
    event_type:        eventType || '',
    partnership_type:  resolveEnum('partnershipType', deal[FIELDS.partnershipType]),
    partnership_plan:  resolveEnum('partnershipPlan', deal[FIELDS.partnershipPlan]),
    partner_id:        deal[FIELDS.partnerID] || '',
    aisensy_plan_id:   deal[FIELDS.aiSensyPlanID] || '',
    partner_plan_id:   deal[FIELDS.partnerPlanID] || '',
    agreement_ack:     resolveEnum('agreementAck',   deal[FIELDS.agreementAck]),
    waba_group:        resolveEnum('wabaGroup',      deal[FIELDS.wabaGroup]),
    ob_team_looped:    resolveEnum('onboardingTeam', deal[FIELDS.onboardingTeam]),
    add_ons:           resolveSet(deal[FIELDS.addOns]),
    onboarding_fees:   deal[FIELDS.onboardingFees] || '',
    waba_charges:      deal[FIELDS.wabaCharges] || '',
    sub_domain:        deal[FIELDS.subDomain] || '',
    lead_origin:       deal[FIELDS.leadOrigin] || '',
    affiliate_id:      deal[FIELDS.affiliateID] || '',
    onboarding_remark: deal[FIELDS.onboardingRemark] || '',
    sales_remark:      deal[FIELDS.salesRemark] || '',
    prev_stage_id:     prev?.stage_id || null,
    deal_created:      deal.add_time || '',
    last_stage_change: deal.stage_change_time || '',
  };
}

function firstPayloadObject(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function getWebhookDeal(payload) {
  return firstPayloadObject(
    payload.current ||
    payload.data?.current ||
    payload.data ||
    payload.deal ||
    null
  );
}

function getWebhookPrevious(payload) {
  return firstPayloadObject(payload.previous || payload.data?.previous || {});
}

function getWebhookEvent(payload) {
  const action = payload.meta?.action || payload.action || payload.event;
  const object = payload.meta?.object || payload.object;
  return [action, object].filter(Boolean).join('.') || 'updated';
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── WEBHOOK ENDPOINT ────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const deal    = getWebhookDeal(payload);
    const prev    = getWebhookPrevious(payload);

    if (!deal) {
      console.log('[webhook] ignored: no deal in payload');
      return res.status(200).send('ignored: no deal in payload');
    }
    if (Number(deal.pipeline_id) !== ONBOARDING_PIPELINE_ID) {
      return res.status(200).send('skipped: wrong pipeline');
    }

    const row = parseDeal(deal, prev, getWebhookEvent(payload));
    row.stage_name = await getStageName(row.stage_id);
    insertDeal.run(row);

    console.log(`[webhook] saved deal ${row.deal_id} | exec: ${row.exec_name} | status: ${row.status}`);
    res.status(200).send('ok');
  } catch (err) {
    console.error('[webhook] error:', err.message);
    res.status(500).send('error: ' + err.message);
  }
});

// ─── BACKFILL ENDPOINT ────────────────────────────────────────────────────────
app.post('/backfill', async (req, res) => {
  try {
    let start = 0;
    const limit = 500;
    let total = 0;

    while (true) {
      const url = `https://api.pipedrive.com/v1/deals?pipeline_id=${ONBOARDING_PIPELINE_ID}&status=all_not_deleted&limit=${limit}&start=${start}&api_token=${PIPEDRIVE_API_TOKEN}`;
      const apiRes = await fetch(url);
      const json   = await apiRes.json();

      if (!json.success || !json.data || json.data.length === 0) break;

      for (const deal of json.data) {
        const row = parseDeal(deal, {}, 'backfill');
        row.stage_name = await getStageName(row.stage_id);
        insertDeal.run(row);
        total++;
      }

      if (!json.additional_data?.pagination?.more_items_in_collection) break;
      start += limit;
    }

    console.log(`[backfill] imported ${total} deals`);
    res.json({ success: true, imported: total });
  } catch (err) {
    console.error('[backfill] error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── API: SUMMARY BY EXEC + MONTH ─────────────────────────────────────────────
app.get('/api/summary', (req, res) => {
  const rows = db.prepare(`
    SELECT
      exec_name,
      strftime('%Y-%m', COALESCE(NULLIF(won_time,''), recorded_at)) AS month,
      COUNT(*) AS count
    FROM deals
    WHERE status = 'won'
      AND exec_name != 'Unassigned'
      AND exec_name IS NOT NULL
      AND exec_name != ''
    GROUP BY exec_name, month
    ORDER BY month DESC, exec_name
  `).all();
  res.json(rows);
});

// ─── API: STATS CARDS ─────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const lastMonth    = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);

  const totalWon = db.prepare(`SELECT COUNT(*) as c FROM deals WHERE status='won'`).get().c;
  const thisMonth = db.prepare(`
    SELECT COUNT(*) as c FROM deals
    WHERE status='won'
    AND strftime('%Y-%m', COALESCE(NULLIF(won_time,''), recorded_at)) = ?
  `).get(currentMonth).c;
  const lastMonthCount = db.prepare(`
    SELECT COUNT(*) as c FROM deals
    WHERE status='won'
    AND strftime('%Y-%m', COALESCE(NULLIF(won_time,''), recorded_at)) = ?
  `).get(lastMonth).c;
  const activeExecs = db.prepare(`
    SELECT COUNT(DISTINCT exec_name) as c FROM deals
    WHERE status='won' AND exec_name != 'Unassigned' AND exec_name != ''
  `).get().c;
  const inProgress = db.prepare(`SELECT COUNT(*) as c FROM deals WHERE status='open'`).get().c;

  res.json({ totalWon, thisMonth, lastMonthCount, activeExecs, inProgress });
});

// ─── API: RECENT DEALS ────────────────────────────────────────────────────────
app.get('/api/recent', (req, res) => {
  const rows = db.prepare(`
    SELECT deal_id, deal_title, exec_name, deal_owner, status,
           partnership_type, partnership_plan, won_time, recorded_at,
           agreement_ack, waba_group, ob_team_looped
    FROM deals
    ORDER BY id DESC
    LIMIT 50
  `).all();
  res.json(rows);
});

// ─── API: BY PARTNERSHIP TYPE ─────────────────────────────────────────────────
app.get('/api/by-type', (req, res) => {
  const rows = db.prepare(`
    SELECT partnership_type, COUNT(*) as count
    FROM deals
    WHERE status='won' AND partnership_type != ''
    GROUP BY partnership_type
    ORDER BY count DESC
  `).all();
  res.json(rows);
});

// ─── API: EXEC LEADERBOARD ────────────────────────────────────────────────────
app.get('/api/leaderboard', (req, res) => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const rows = db.prepare(`
    SELECT
      exec_name,
      COUNT(*) as total_won,
      SUM(CASE WHEN strftime('%Y-%m', COALESCE(NULLIF(won_time,''), recorded_at)) = ? THEN 1 ELSE 0 END) as this_month
    FROM deals
    WHERE status='won' AND exec_name != 'Unassigned' AND exec_name != ''
    GROUP BY exec_name
    ORDER BY this_month DESC, total_won DESC
  `).all(currentMonth);
  res.json(rows);
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`AiSensy Onboarding Dashboard running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Webhook:   http://localhost:${PORT}/webhook`);
  console.log(`Backfill:  POST http://localhost:${PORT}/backfill`);
});
