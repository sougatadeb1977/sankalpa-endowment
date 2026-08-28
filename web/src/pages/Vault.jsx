import React, { useRef, useState } from 'react';
import { api, useApi, Head, Icon, pct, titleize } from '../lib.jsx';

const SAMPLE = `LAST WILL AND TESTAMENT OF MARGARETHE ANNA LINDQVIST

I, Margarethe Anna Lindqvist, a resident of Stockholm County, being of sound mind and
memory, do hereby make, publish and declare this to be my Last Will and Testament,
dated this 14th day of March, 2025, hereby revoking all prior wills and codicils.

ARTICLE III — CHARITABLE BEQUEST

I give, devise and bequeath twenty percent (20%) of my residuary estate to the ART OF
LIVING FOUNDATION, a California nonprofit public benefit corporation, to be used for its
general endowment purposes, and I further direct that the sum of $250,000 be distributed
to said Foundation restricted to educational programs for children in rural communities.

If the Art of Living Foundation shall not then be in existence, or shall not then qualify
as a charitable organization under Section 501(c)(3) of the Internal Revenue Code, then I
direct that this bequest pass instead to the International Association for Human Values.

ARTICLE IV — RETIREMENT ASSETS

I direct my executor to designate the Foundation as beneficiary of fifty percent of my
retirement account held with Fidelity Investments, account number FID-4471902.

ARTICLE V — TRUST PROVISIONS

The Margarethe A. Lindqvist Revocable Living Trust, established under separate instrument,
shall receive the remainder of my estate. My trustee is Nordic Wealth Partners.`;

function Confidence({ v }) {
  const hi = v >= 0.9;
  return <span className={`entity-conf ${hi ? 'conf-hi' : 'conf-lo'}`}>{Math.round(v * 100)}%</span>;
}

export default function Vault() {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);
  const { data: ai } = useApi('/ai/status');

  async function parse(input) {
    const src = (input ?? text).trim();
    if (src.length < 40) { setErr('Paste at least a paragraph so the engine has something to read.'); return; }
    setErr(null); setBusy(true); setResult(null);
    try { setResult(await api('/ai/parse-document', { method: 'POST', body: { text: src } })); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  function readFile(file) {
    if (!file) return;
    if (!/text|json|xml/.test(file.type) && !/\.(txt|md|rtf|json)$/i.test(file.name)) {
      setErr(`This demonstration reads plain text. In production the pipeline runs OCR (Google Document AI, AWS Textract failover) over PDF, DOCX, JPG, PNG and TIFF. Please paste the text of "${file.name}" instead.`);
      return;
    }
    const r = new FileReader();
    r.onload = () => { setText(String(r.result).slice(0, 200000)); parse(String(r.result)); };
    r.readAsText(file);
  }

  return (
    <section className="section">
      <div className="wrap">
        <Head over="Secure document vault" title="The AI that reads estate documents."
          lede="Wills and trusts are long, and reviewing them by hand is slow. Paste one in and the engine extracts what matters, scores its own confidence, and sends anything uncertain to a human being rather than into your record." />

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 40, alignItems: 'start' }}
          data-tour="vault">
          <div>
            <div className={`vault-drop${over ? ' over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); readFile(e.dataTransfer.files[0]); }}>
              <Icon.vault width={30} height={30} style={{ color: 'var(--earth)' }} />
              <p style={{ margin: '14px 0 6px', fontWeight: 600 }}>Drag a document here, or paste the text below</p>
              <p className="tiny muted" style={{ marginBottom: 14 }}>
                PDF · DOCX · JPG · PNG · TIFF up to 50 MB in production, via OCR. This demonstration reads plain text.
              </p>
              <div className="row" style={{ justifyContent: 'center' }}>
                <button className="btn btn-sm btn-ghost" onClick={() => fileRef.current?.click()}>Browse files</button>
                <button className="btn btn-sm btn-ghost" onClick={() => { setText(SAMPLE); parse(SAMPLE); }}>
                  Try a sample will
                </button>
              </div>
              <input ref={fileRef} type="file" hidden onChange={(e) => readFile(e.target.files[0])} />
            </div>

            <div className="field" style={{ marginTop: 22 }}>
              <label htmlFor="doc">Document text</label>
              <textarea id="doc" rows={16} value={text} onChange={(e) => setText(e.target.value)}
                placeholder="Paste the text of a will, trust, beneficiary designation or insurance policy…"
                style={{ fontFamily: 'var(--mono)', fontSize: 12.5, lineHeight: 1.6, resize: 'vertical' }} />
            </div>
            {err && <p className="err">{err}</p>}
            <button className="btn btn-gold" onClick={() => parse()} disabled={busy}>
              {busy ? <><span className="spinner" /> Reading the document</> : <>Extract with AI <Icon.sparkle width={16} height={16} /></>}
            </button>

            <div className="card" style={{ marginTop: 26, background: 'var(--lotus)' }}>
              <div className="overline">How your document is protected</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.85 }}>
                <li>AES-256 encryption at rest, TLS 1.3 in transit</li>
                <li>Soft delete only — an estate document is never destroyed, and is retained 99 years</li>
                <li>Every upload, parse, view, download and share is written to an append-only audit log</li>
                <li>Findings below 90% confidence go to a reviewer, never straight into your record</li>
              </ul>
            </div>
          </div>

          <div>
            {busy && (
              <div className="card">
                <div className="row"><span className="spinner" /> <span className="small">Running OCR, entity extraction and confidence scoring…</span></div>
              </div>
            )}
            {!busy && !result && (
              <div className="card" style={{ borderStyle: 'dashed', textAlign: 'center', padding: 60 }}>
                <Icon.doc width={30} height={30} style={{ color: 'var(--border-strong)' }} />
                <p className="muted small" style={{ marginTop: 16, marginBottom: 0 }}>
                  Extraction results will appear here.
                </p>
              </div>
            )}
            {result && (
              <>
                <div className="card card-feature">
                  <div className="between" style={{ marginBottom: 16 }}>
                    <div>
                      <div className="overline" style={{ marginBottom: 4 }}>Document classified as</div>
                      <div className="h-sub">{titleize(result.documentType)}</div>
                    </div>
                    <span className={`badge ${result.parseStatus === 'completed' ? 'b-active' : result.parseStatus === 'needs_review' ? 'b-pending' : 'b-lapsed'}`}>
                      {result.parseStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <p style={{ fontSize: 15, marginBottom: 16 }}>{result.summary}</p>
                  <div className="row" style={{ gap: 26, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    {[
                      [result.entities.length, 'entities found'],
                      [result.autoPopulate.length, 'auto-populated'],
                      [result.hitlQueue.length, 'for human review'],
                      [`${result.processingMs}ms`, 'processing time'],
                    ].map(([v, l]) => (
                      <div key={l}>
                        <div className="serif-num" style={{ fontSize: 24, color: 'var(--indigo)', fontWeight: 600 }}>{v}</div>
                        <div className="tiny muted">{l}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card" style={{ marginTop: 22 }}>
                  <div className="overline">Extracted entities</div>
                  {result.entities.map((e, i) => (
                    <div key={i} className="entity">
                      <Confidence v={e.confidence} />
                      <div style={{ minWidth: 0 }}>
                        <div className="entity-label">{e.label.replace(/_/g, ' ')}</div>
                        <div className="entity-val">{typeof e.value === 'number' ? e.value.toLocaleString('en-US') : e.value}</div>
                        <div className="entity-ev">“…{e.evidence}…”</div>
                      </div>
                    </div>
                  ))}
                  {!result.entities.length && <p className="muted small">No recognisable estate entities were found in this text.</p>}
                </div>

                {result.hitlQueue.length > 0 && (
                  <div className="card" style={{ marginTop: 22, borderLeft: '3px solid var(--saffron)' }}>
                    <div className="overline">Human review queue</div>
                    <p className="small muted" style={{ marginBottom: 12 }}>
                      {result.hitlQueue.length} finding{result.hitlQueue.length > 1 ? 's fall' : ' falls'} below the
                      90% auto-populate threshold and will be confirmed by a gift officer within two business days.
                      Reviewer corrections are logged and fed back as training data.
                    </p>
                    {result.hitlQueue.map((e, i) => (
                      <div key={i} className="between small" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <span>{e.label.replace(/_/g, ' ')}</span>
                        <span className="muted">{String(e.value).slice(0, 40)}</span>
                        <span style={{ color: 'var(--saffron)', fontWeight: 600 }}>{pct(e.confidence * 100, 0)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="tiny muted" style={{ marginTop: 18 }}>
                  Engine: {result.provider}
                  {ai && !ai.llmEnabled && ' — deterministic legal-domain NER. Configure an Azure OpenAI or Anthropic key to add generative narration on top of the same extractions.'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
