'use strict';
/**
 * SANKALPA - Smart workflows & stewardship automation.
 *
 * A deferred gift matures over decades. The relationship has to survive that
 * long, which means the follow-ups cannot depend on anyone remembering. This
 * module evaluates a rule set against the live database every time it runs and
 * materialises dated, deduplicated tasks: birthdays, gift anniversaries,
 * lapsing donors, pledge follow-ups, estate-document review cycles, milestone
 * acknowledgements and premium lapses.
 *
 * Tasks are idempotent - the (donor, rule, due_date) triple is unique, so
 * running the engine hourly never produces duplicates.
 */
const { db, uuid, now } = require('./db');
const actuarial = require('./actuarial');

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / DAY);

/** Next occurrence of a month/day anniversary, as an ISO date. */
function nextAnniversary(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const next = new Date(Date.UTC(today.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (next < today) next.setUTCFullYear(next.getUTCFullYear() + 1);
  return iso(next);
}

const RULES = [
  {
    key: 'birthday',
    label: 'Birthday greeting',
    horizonDays: 21,
    build(d) {
      const due = nextAnniversary(d.date_of_birth);
      if (!due) return null;
      const age = Math.floor(actuarial.ageFromDob(d.date_of_birth) || 0) + 1;
      return {
        due_date: due, priority: age % 10 === 0 ? 'high' : 'normal', channel: 'email',
        title: `Birthday: ${d.first_name} ${d.last_name} turns ${age}`,
        detail: `Send a personal greeting from the ashram. ${age >= 70
          ? `At ${age} this supporter is eligible for a qualified charitable distribution from an IRA and for the higher gift-annuity rates - but lead with the greeting, not the ask.`
          : 'No ask. A greeting only.'}`,
      };
    },
  },
  {
    key: 'gift_anniversary',
    label: 'First-gift anniversary',
    horizonDays: 21,
    build(d) {
      if (!d.first_gift_date) return null;
      const due = nextAnniversary(d.first_gift_date);
      const years = new Date(due).getUTCFullYear() - new Date(d.first_gift_date).getUTCFullYear();
      if (years < 1) return null;
      return {
        due_date: due, priority: years % 5 === 0 ? 'high' : 'low', channel: 'email',
        title: `${years}-year giving anniversary: ${d.first_name} ${d.last_name}`,
        detail: `${years} years of support, $${Math.round(d.total_donated).toLocaleString('en-US')} given in total. Send the annual impact note showing exactly what that funded.`,
      };
    },
  },
  {
    key: 'lapse_risk',
    label: 'Lapsing supporter',
    build(d) {
      if (!d.last_gift_date) return null;
      const since = daysBetween(Date.now(), d.last_gift_date);
      if (since < 400 || since > 1100) return null;
      return {
        due_date: iso(Date.now() + 7 * DAY), priority: d.total_donated > 10000 ? 'high' : 'normal',
        channel: 'phone',
        title: `Re-engage ${d.first_name} ${d.last_name} - ${Math.round(since / 30)} months since last gift`,
        detail: `Lifetime giving $${Math.round(d.total_donated).toLocaleString('en-US')}. Call, do not email. Ask how they are, share what their earlier giving accomplished, and make no request on the first contact.`,
      };
    },
  },
  {
    key: 'legacy_qualified',
    label: 'Legacy conversation',
    build(d) {
      const age = actuarial.ageFromDob(d.date_of_birth);
      if (!age || age < 58) return null;
      if (d.planned_gift_count > 0) return null;
      if ((d.total_donated || 0) < 2500) return null;
      return {
        due_date: iso(Date.now() + 14 * DAY), priority: d.total_donated > 25000 ? 'high' : 'normal',
        channel: 'meeting',
        title: `Legacy conversation: ${d.first_name} ${d.last_name}, age ${Math.floor(age)}`,
        detail: `A loyal supporter at $${Math.round(d.total_donated).toLocaleString('en-US')} lifetime with no documented legacy intention. Offer the will-planning tool and the Legacy Circle, not a dollar figure.`,
      };
    },
  },
  {
    key: 'estate_review',
    label: 'Estate document review cycle',
    build(d) {
      if (!d.planned_gift_count) return null;
      if (!d.oldest_gift_date) return null;
      const age = daysBetween(Date.now(), d.oldest_gift_date);
      if (age < 1000) return null;
      return {
        due_date: iso(Date.now() + 30 * DAY), priority: 'normal', channel: 'email',
        title: `Three-year estate review: ${d.first_name} ${d.last_name}`,
        detail: 'Wills change. Confirm the Foundation is still named, the allocation is unchanged, and the executor details on file are current. A revocable intention must be re-confirmed periodically or it should be re-rated in the pipeline.',
      };
    },
  },
  {
    key: 'document_missing',
    label: 'Missing documentation',
    build(d) {
      if (!d.planned_gift_count || d.document_count > 0) return null;
      return {
        due_date: iso(Date.now() + 10 * DAY), priority: 'high', channel: 'email',
        title: `No documentation on file: ${d.first_name} ${d.last_name}`,
        detail: 'A planned gift is recorded but no supporting document is in the vault. Request a copy of the relevant page of the will, trust or beneficiary form so the intention can be verified and valued correctly.',
      };
    },
  },
  {
    key: 'major_gift_ack',
    label: 'Major gift acknowledgement',
    build(d) {
      if (!d.recent_major_gift) return null;
      return {
        due_date: iso(Date.now() + 2 * DAY), priority: 'high', channel: 'phone',
        title: `Acknowledge $${Math.round(d.recent_major_gift).toLocaleString('en-US')} gift from ${d.first_name} ${d.last_name}`,
        detail: 'Gifts over $5,000 receive a personal telephone call within 48 hours, before the written receipt arrives. Thank, do not ask.',
      };
    },
  },
  {
    key: 'milestone_circle',
    label: 'Legacy Circle invitation',
    build(d) {
      if (d.is_legacy_society) return null;
      if ((d.total_donated || 0) < 25000) return null;
      return {
        due_date: iso(Date.now() + 21 * DAY), priority: 'normal', channel: 'meeting',
        title: `Invite ${d.first_name} ${d.last_name} to the Sankalpa Legacy Circle`,
        detail: `Cumulative giving has passed $25,000. Extend the Legacy Circle invitation and the annual gathering with Foundation leadership.`,
      };
    },
  },
];

/** Load the enriched donor rows the rules operate on. */
function donorFacts() {
  return db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM planned_gifts pg WHERE pg.donor_id = d.id) planned_gift_count,
      (SELECT MIN(created_at) FROM planned_gifts pg WHERE pg.donor_id = d.id) oldest_gift_date,
      (SELECT COUNT(*) FROM documents dc WHERE dc.donor_id = d.id AND dc.deleted_at IS NULL) document_count,
      (SELECT MAX(amount) FROM transactions t WHERE t.donor_id = d.id AND t.status='completed'
         AND t.amount >= 5000 AND julianday('now') - julianday(t.transaction_date) <= 5) recent_major_gift
    FROM donors d WHERE d.deleted_at IS NULL`).all();
}

/**
 * Evaluate every rule against every donor and materialise due tasks.
 * Idempotent: re-running never duplicates an existing (donor, rule, date) task.
 */
function runEngine({ horizonDays = 45 } = {}) {
  const donors = donorFacts();
  const ins = db.prepare(`INSERT OR IGNORE INTO stewardship_tasks
    (id,donor_id,rule_key,title,detail,due_date,priority,channel,status,auto_generated,created_at)
    VALUES (?,?,?,?,?,?,?,?,'open',1,?)`);
  let created = 0, evaluated = 0;
  const tx = db.transaction(() => {
    for (const d of donors) {
      for (const rule of RULES) {
        evaluated++;
        let t;
        try { t = rule.build(d); } catch { t = null; }
        if (!t || !t.due_date) continue;
        const lead = daysBetween(t.due_date, Date.now());
        if (lead > (rule.horizonDays ?? horizonDays) || lead < -30) continue;
        const r = ins.run(uuid(), d.id, rule.key, t.title, t.detail, t.due_date,
          t.priority || 'normal', t.channel || 'email', now());
        if (r.changes) created++;
      }
    }
  });
  tx();
  return { evaluated, created, donors: donors.length, ranAt: now() };
}

function openTasks(limit = 200) {
  return db.prepare(`SELECT s.*, d.first_name, d.last_name, d.email, d.country, d.total_donated
    FROM stewardship_tasks s LEFT JOIN donors d ON d.id = s.donor_id
    WHERE s.status = 'open'
    ORDER BY CASE s.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, s.due_date
    LIMIT ?`).all(limit);
}

function completeTask(id, userId) {
  const t = db.prepare('SELECT * FROM stewardship_tasks WHERE id = ?').get(id);
  if (!t) return null;
  db.prepare("UPDATE stewardship_tasks SET status='done', completed_at=?, completed_by=? WHERE id=?")
    .run(now(), userId || null, id);
  const { logInteraction } = require('./db');
  logInteraction({
    donor_id: t.donor_id, channel: t.channel, interaction_type: 'stewardship_touch',
    subject: t.title, detail: 'Stewardship task completed', source: 'stewardship-engine',
    logged_by: userId || null, related_resource: id,
  });
  return { ok: true, id };
}

function summary() {
  const byRule = db.prepare(`SELECT rule_key, COUNT(*) n,
      SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) open
    FROM stewardship_tasks GROUP BY rule_key ORDER BY open DESC`).all();
  const labels = Object.fromEntries(RULES.map((r) => [r.key, r.label]));
  return {
    rules: RULES.map((r) => ({ key: r.key, label: r.label })),
    byRule: byRule.map((r) => ({ ...r, label: labels[r.rule_key] || r.rule_key })),
    open: db.prepare("SELECT COUNT(*) n FROM stewardship_tasks WHERE status='open'").get().n,
    overdue: db.prepare("SELECT COUNT(*) n FROM stewardship_tasks WHERE status='open' AND due_date < date('now')").get().n,
    dueThisWeek: db.prepare(`SELECT COUNT(*) n FROM stewardship_tasks WHERE status='open'
      AND due_date BETWEEN date('now') AND date('now','+7 day')`).get().n,
    completed: db.prepare("SELECT COUNT(*) n FROM stewardship_tasks WHERE status='done'").get().n,
  };
}

module.exports = { runEngine, openTasks, completeTask, summary, RULES };
