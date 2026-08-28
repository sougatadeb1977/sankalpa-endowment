import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from './lib.jsx';
import { useDraggable } from './useDraggable.js';

/**
 * MAITRI — the floating guide.
 *
 * Maitri (Sanskrit: loving friendliness) walks a visitor through every step of
 * the platform: she navigates the app for you, spotlights the element she is
 * describing, and narrates in a natural human voice using the browser's neural
 * speech voices, ranked so the best available voice is chosen automatically.
 * Everything she says is also on screen, so the tour works with sound off.
 *
 * Both the launcher and the panel can be dragged anywhere on screen - by mouse,
 * finger or pen - because a fixed corner will always cover something somebody
 * needs to read. The position is clamped to the viewport, survives a reload,
 * and can be reset from the panel header.
 */

const TOUR = [
  {
    route: '/', title: 'Welcome to Sankalpa',
    say: 'Welcome. I am Maitri, your guide. Sankalpa is a Sanskrit word for a sacred intention held in the heart — the vow you make to yourself about the world you wish to leave behind. This platform carries that intention from the moment you feel it, all the way to the programmes it will fund a hundred years from now. Each page is arranged in tabs, so nothing is buried at the bottom of a long scroll — I will open the right one as we go. Let me walk you through every step.',
  },
  {
    route: '/', spot: '[data-tour="meter"]', title: 'One promise, measured openly',
    say: 'This is the endowment. Forty-five million dollars, raised once, invested permanently, so that Gurudev\'s work is never again at the mercy of a difficult year. The bar you see moves in real time. It counts cash already received, and the present value of every gift promised for the future. Nothing here is rounded up or dressed up.',
  },
  {
    route: '/', tab: 'funds', spot: '[data-tour="funds"]', title: 'Choose where your gift lives',
    say: 'You can give to the permanent endowment, or direct your gift to youth leadership, veteran and trauma relief, rural education, or disaster response. Every restricted gift is tracked in its own net asset class, which is an accounting way of saying: money given for children can never quietly be spent on something else.',
  },
  {
    route: '/', tab: 'reach', title: 'The world it comes from',
    say: 'This is where the money actually comes from. Every marker is a country with supporters in it, and each is sized by what has been given there — the United States and India largest, then Germany, Britain, Switzerland, Sweden, Singapore, Kenya, Brazil. Peace does not belong to one country, and neither does this endowment.',
  },
  {
    route: '/give', spot: '[data-tour="amount"]', title: 'Giving today',
    say: 'Here is the giving page. Choose an amount, or type your own. Watch the line beneath it — as you change the amount, we tell you in plain language what that gift actually does. Not a vague promise. A number of people reached.',
  },
  {
    route: '/give', spot: '[data-tour="methods"]', title: 'Give the way you already pay',
    say: 'Card, bank transfer, PayPal, Apple Pay, Google Pay, donor advised fund, cryptocurrency, appreciated stock, or a cheque in the post. Supporters give from a hundred and eighty countries, so we meet you where you are. Your card details never touch our servers — they go straight to the payment processor.',
  },
  {
    route: '/planned-giving', tab: 'ways', title: 'The seven ways to leave a legacy',
    say: 'Now the heart of it. A legacy gift costs you nothing today. Name the Foundation in your will. Leave a percentage of a retirement account, which passes to charity completely untaxed. Assign a life insurance policy you no longer need. Give appreciated shares and avoid capital gains entirely. Or set up a trust that pays you an income for life, and gives what remains to the Foundation.',
  },
  {
    route: '/planned-giving', tab: 'partners', title: 'We hand you to the right tool',
    say: 'The Foundation does not pretend to be a law firm or a brokerage. Write your will free of charge through FreeWill. Transfer shares in a few clicks through DonateStock. Run your own fundraiser through GoFundMe dot org. Each is a real partner, and each sends the record back here automatically, so nothing depends on anyone re-typing it.',
  },
  {
    route: '/calculators', tab: 'legacy', spot: '[data-tour="calc"]', title: 'Real numbers, not brochure numbers',
    say: 'Six calculators, and all of them run genuine actuarial mathematics on our server — Social Security mortality tables, the current I.R.S. section seven five two zero rate, and the American Council on Gift Annuities schedule. Move the sliders. If a gift annuity would pay you six point one percent for life, it says six point one percent, because that is what the table says.',
  },
  {
    route: '/calculators', tab: 'ira', title: 'The retirement account tab is the one to read',
    say: 'If you take one thing from this tour, take this. Money left in a four-oh-one-k or an I.R.A. is taxed as income when your children inherit it — they can lose a third of it. Left to a charity, not a cent is lost, because a charity pays no income tax. The calculator shows you both columns side by side, and then walks you through the beneficiary form for your own custodian, step by step. It takes ten minutes and costs nothing.',
  },
  {
    route: '/calculators', tab: 'stock', title: 'And shares, rather than cash',
    say: 'The appreciated stock tab makes the other argument. Sell shares first and the capital gains tax comes out before the Foundation sees anything. Transfer the shares instead and nobody realises the gain, so nobody pays the tax. We show it two honest ways — same block of stock, and same gift delivered — because a single view of that comparison is always a little misleading.',
  },
  {
    route: '/vault', spot: '[data-tour="vault"]', title: 'The document vault, and the AI that reads',
    say: 'Estate documents are long, and lawyers are expensive. Paste in a will or a trust and our engine reads it the way a planned giving officer would — finding the Foundation\'s name, the percentage or amount left to it, whether the instrument is revocable, and the date it was signed. Every finding carries a confidence score. Anything below ninety percent goes to a human being for review, never straight into your record.',
  },
  {
    route: '/impact', spot: '[data-tour="impact"]', title: 'Your own dashboard',
    say: 'Once you have given, this becomes your home. Your lifetime giving, the lives it has touched, your pledges, your documents, and a small set of suggestions chosen for you — never a fundraising push, only the next step that genuinely fits your situation and your age.',
  },
  {
    route: '/counsel', tab: 'network', title: 'When a gift is complicated',
    say: 'Some gifts do not fit a form. A vineyard held in a company. Farmland across two states. Pre-public shares. Tell us what you hold, and the platform triages it in seconds, matches you to a firm licensed in your own state, and commits to a time by which someone will call. Estate law is state law, so no single firm covers the country — instead there is a panel, covering every state where our supporters actually live. You engage and pay the adviser directly, which is precisely why their advice about a gift to us can be trusted. When the plan is signed, you send us the outcome only, and we track it from there.',
  },
  {
    route: '/portal', spot: '[data-tour="portal"]', title: 'The other half of the platform',
    say: 'Everything you have seen is the donor\'s half. Behind a multi-factor login sits a complete fund accounting product. Not a dashboard — a product. There is a left-hand rail grouped the way a finance team actually works: overview, fund accounting, portfolio, relationships, and the system itself. Sign in and look for yourself; the credentials are printed on the screen.',
  },
  {
    route: '/portal', title: 'A real general ledger',
    say: 'The fund accounting section is the heart of it. A general journal holding four and a half thousand posted entries, filterable by account, by fund, by entry type, by period, or by free text. A trial balance that proves debits equal credits for whichever year you choose. The statement of activities and the statement of financial position under the American nonprofit accounting standard, with the prior year alongside every figure. And the full chart of accounts, which is never deleted from, only inactivated, so a fifteen-year-old entry still resolves.',
  },
  {
    route: '/portal', title: 'Six years, compared',
    say: 'Notice the fiscal year selector in the top bar. It drives every view that has a period, so the question of which year you are looking at is answered once rather than screen by screen. The year on year page then lays all six side by side: revenue, expenses, the change in net assets, cash received, donor counts, average gift, and the programme expense ratio — which is the number every serious donor and every charity rating agency looks at first.',
  },
  {
    route: '/portal', title: 'The data hub',
    say: 'And then the part I would want if I were the finance director. The data hub opens every one of the twenty-two tables the platform holds — twenty-two thousand rows — to be browsed, sorted, filtered by year, searched and exported to a spreadsheet. Underneath it, twelve integrity checks run against the live database every time the page loads: is the ledger in balance, does every entry balance individually, are there orphaned lines, is any completed gift missing from the ledger, are the valuations current. A finance team cannot be asked to trust a system whose contents it cannot inspect.',
  },
  {
    route: '/portal', title: 'Why the ledger matters to you',
    say: 'Most charities ask you to trust them. This one shows you the books. Every gift you make writes a balanced journal entry the moment it is received. Debits equal credits, always, or the gift is refused outright. That is the difference between a promise and a proof.',
  },
  {
    route: '/portal', title: 'And the part that remembers you',
    say: 'One more thing behind that login. A deferred gift can take thirty years to mature, and a relationship cannot depend on someone remembering. So the platform keeps its own memory: birthdays, giving anniversaries, supporters who have quietly drifted away, wills that ought to be re-confirmed after three years, insurance premiums that have started to slip. Every interaction is logged without anyone typing it. The follow-ups happen because the system raises them, not because a person did.',
  },
  {
    route: '/portal', title: 'And an honest account of what is not finished',
    say: 'The last page in that rail is a go-live plan, and it is deliberately candid. It says plainly what is real — the ledger, the actuarial engine, the document extraction, the stewardship automation — and what is not: no card is actually charged yet, scanned documents are not yet read by optical character recognition, and staff sign-in still uses demonstration credentials. Then it sequences the twenty weeks of work that would close the gap, with costs. A platform that hides its gaps is harder to trust than one that lists them.',
  },
  {
    route: '/about', title: 'Forty-five years of quiet work',
    say: 'The Art of Living Foundation was founded in nineteen eighty-one. Ten thousand centres. A hundred and eighty countries. Eight hundred million lives touched. Trauma relief for veterans, breathing programmes in prisons, free schools in rural India, peace work in Sri Lanka, Colombia, Iraq and Kosovo. This endowment is how that continues after all of us.',
  },
  {
    route: '/give', title: 'Whenever you are ready',
    say: 'That is the whole platform. Give today, or plant something for a century from now — both matter, and both are received with the same care. Thank you for letting me walk with you. Peace starts within, and then it spreads.',
  },
];

const VOICE_RANK = [
  /natural/i, /aria/i, /jenny/i, /sonia/i, /libby/i, /google uk english female/i,
  /google us english/i, /samantha/i, /serena/i, /karen/i, /moira/i, /fiona/i, /zira/i,
];

function rankVoice(v) {
  if (!/^en/i.test(v.lang)) return -1;
  const i = VOICE_RANK.findIndex((re) => re.test(v.name));
  let score = i >= 0 ? 100 - i : 10;
  if (v.localService === false) score += 12; // cloud neural voices sound best
  if (/en-GB|en-IN|en-AU/i.test(v.lang)) score += 4;
  return score;
}

export default function Guide() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState(() => localStorage.getItem('sankalpa_voice') || '');
  const [spot, setSpot] = useState(null);
  const [nudge, setNudge] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const speakingRef = useRef(false);
  const autoRef = useRef(null);

  // Panel and launcher remember where the reader put them, separately.
  const panelDrag = useDraggable({ storageKey: 'sankalpa_guide_pos', margin: 8 });
  const fabDrag = useDraggable({ storageKey: 'sankalpa_fab_pos', margin: 12 });

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  /* Load voices (Chrome populates them asynchronously). */
  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices().filter((x) => /^en/i.test(x.lang));
      if (!v.length) return;
      setVoices(v);
      setVoiceName((cur) => cur && v.some((x) => x.name === cur)
        ? cur
        : [...v].sort((a, b) => rankVoice(b) - rankVoice(a))[0]?.name || '');
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [supported]);

  /* Gentle one-time invitation to start the tour. */
  useEffect(() => {
    if (sessionStorage.getItem('sankalpa_guide_seen')) return;
    const t = setTimeout(() => setNudge(true), 5200);
    return () => clearTimeout(t);
  }, []);

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    speakingRef.current = false;
    clearTimeout(autoRef.current);
    setPlaying(false);
  }, [supported]);

  const speak = useCallback((text, onEnd) => {
    if (!supported || muted) {
      // Silent mode: hold on each step long enough to read it.
      autoRef.current = setTimeout(() => onEnd && onEnd(), Math.min(19000, 2600 + text.length * 42));
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find((x) => x.name === voiceName);
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = 0.94; u.pitch = 1.02; u.volume = 1;
    u.onend = () => { speakingRef.current = false; onEnd && onEnd(); };
    u.onerror = () => { speakingRef.current = false; onEnd && onEnd(); };
    speakingRef.current = true;
    window.speechSynthesis.speak(u);
  }, [supported, muted, voices, voiceName]);

  /* Position the spotlight over the step's target element. */
  const placeSpot = useCallback((selector) => {
    if (!selector) { setSpot(null); return; }
    let tries = 0;
    const attempt = () => {
      const el = document.querySelector(selector);
      if (!el) { if (tries++ < 24) setTimeout(attempt, 130); else setSpot(null); return; }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        setSpot({
          top: r.top + window.scrollY - 10, left: r.left + window.scrollX - 10,
          width: r.width + 20, height: r.height + 20,
        });
      }, 480);
    };
    attempt();
  }, []);

  /* Run a step: navigate, spotlight, narrate, then advance. */
  const runStep = useCallback((i) => {
    const s = TOUR[i];
    if (!s) { setPlaying(false); setSpot(null); return; }
    if (location.pathname !== s.route) navigate(s.route);
    // Pages are tabbed, so a step may need to open the panel it is describing.
    // Tabs mirror their selection into the hash and listen for hashchange, so
    // setting the hash is enough to switch panel from here.
    if (s.tab && window.location.hash.replace(/^#/, '') !== s.tab) {
      setTimeout(() => { window.location.hash = s.tab; }, 120);
    }
    setSpot(null);
    setTimeout(() => placeSpot(s.spot), s.spot ? 420 : 0);
    if (!s.spot) window.scrollTo({ top: 0, behavior: 'smooth' });
    speak(s.say, () => {
      setStep((cur) => {
        if (cur + 1 >= TOUR.length) { setPlaying(false); setSpot(null); return cur; }
        return cur + 1;
      });
    });
  }, [location.pathname, navigate, placeSpot, speak]);

  /* Drive the tour whenever the step changes while playing. */
  useEffect(() => {
    if (!playing || !open) return;
    runStep(step);
    return () => { clearTimeout(autoRef.current); if (supported) window.speechSynthesis.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, playing, open]);

  useEffect(() => {
    const onScroll = () => { const s = TOUR[step]; if (playing && s?.spot) placeSpot(s.spot); };
    window.addEventListener('resize', onScroll);
    return () => window.removeEventListener('resize', onScroll);
  }, [step, playing, placeSpot]);

  const start = () => {
    sessionStorage.setItem('sankalpa_guide_seen', '1');
    setNudge(false); setOpen(true); setStep(0); setPlaying(true);
  };
  const close = () => { stop(); setOpen(false); setSpot(null); };
  const go = (d) => { stop(); const n = Math.max(0, Math.min(TOUR.length - 1, step + d)); setStep(n); setPlaying(true); };
  const toggle = () => { if (playing) { stop(); } else { setPlaying(true); } };

  const s = TOUR[step];

  if (!open) {
    return (
      <>
        {nudge && (
          <div style={{
            position: 'fixed', right: 100, bottom: 38, zIndex: 89, background: '#fff',
            border: '1px solid var(--border)', boxShadow: 'var(--shadow-lift)', padding: '14px 18px',
            maxWidth: 250, animation: 'guideIn .4s ease',
          }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 17, color: 'var(--indigo)', marginBottom: 4 }}>
              Shall I show you around?
            </div>
            <div className="tiny muted" style={{ marginBottom: 10 }}>
              A four-minute guided walk through every step, narrated aloud.
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm btn-gold" onClick={start}>Yes, guide me</button>
              <button className="btn btn-sm btn-ghost" onClick={() => {
                sessionStorage.setItem('sankalpa_guide_seen', '1'); setNudge(false);
              }}>Not now</button>
            </div>
          </div>
        )}
        <button
          ref={fabDrag.elRef}
          className={`guide-fab${fabDrag.dragging ? ' dragging' : ''}`}
          style={fabDrag.style}
          {...fabDrag.handleProps}
          onClick={() => { if (!fabDrag.moved()) start(); }}
          title="Open the guided tour — drag to move"
          aria-label="Open Maitri, your guided tour. Drag to reposition.">
          <Icon.lotus width={30} height={30} stroke="#fff" strokeWidth={1.4} />
        </button>
      </>
    );
  }

  return (
    <>
      {spot && <div className="spotlight" style={spot} aria-hidden="true" />}
      <aside
        ref={panelDrag.elRef}
        className={`guide-panel${panelDrag.dragging ? ' dragging' : ''}`}
        style={panelDrag.style}
        role="complementary" aria-label="Maitri, guided tour">
        <div
          className="guide-head"
          {...panelDrag.handleProps}
          onDoubleClick={panelDrag.reset}
          title="Drag to move — double-click to snap back">
          <span className="guide-grip" aria-hidden="true"><i /><i /><i /></span>
          <div className={`guide-avatar${playing && !muted ? ' speaking' : ''}`}>
            <Icon.lotus width={22} height={22} stroke="#fff" strokeWidth={1.5} />
          </div>
          <div>
            <div className="guide-name">Maitri</div>
            <div className="guide-role">Your guide</div>
          </div>
          {panelDrag.isPlaced && (
            <button className="guide-x" onClick={panelDrag.reset}
              title="Snap back to the corner" aria-label="Snap the guide back to the corner"
              style={{ marginLeft: 'auto', fontSize: 15 }}>⤢</button>
          )}
          <button className="guide-x" onClick={close} aria-label="Close the guide"
            style={panelDrag.isPlaced ? { marginLeft: 0 } : undefined}>×</button>
        </div>

        <div className="guide-body">
          <div className="guide-step-n">Step {step + 1} of {TOUR.length}</div>
          <h3 className="guide-title">{s.title}</h3>
          <p className="guide-text">{s.say}</p>
          <div className="guide-progress" aria-hidden="true">
            {TOUR.map((_, i) => (
              <span key={i} className={`guide-dot${i < step ? ' done' : i === step ? ' now' : ''}`} />
            ))}
          </div>
        </div>

        <div className="guide-foot">
          <button className="icon-btn" onClick={() => go(-1)} disabled={step === 0} aria-label="Previous step">
            <Icon.prev width={17} height={17} />
          </button>
          <button className="icon-btn" onClick={toggle} aria-label={playing ? 'Pause narration' : 'Play narration'}>
            {playing ? <Icon.pause width={16} height={16} /> : <Icon.play width={16} height={16} />}
          </button>
          <button className="icon-btn" onClick={() => go(1)} disabled={step === TOUR.length - 1} aria-label="Next step">
            <Icon.next width={17} height={17} />
          </button>
          <button className="icon-btn" onClick={() => { stop(); setMuted(!muted); }}
            aria-label={muted ? 'Turn the voice on' : 'Turn the voice off'} title={muted ? 'Voice off' : 'Voice on'}>
            {muted ? <Icon.mute width={17} height={17} /> : <Icon.sound width={17} height={17} />}
          </button>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={close}>Finish</button>
        </div>

        <div className="guide-voice-note">
          <span className="guide-drag-hint">Drag the header to move me</span>
          <br />
          {!supported ? 'Your browser does not offer speech, so the tour runs as text.'
            : voices.length ? (
              <>Voice:{' '}
                <select value={voiceName} onChange={(e) => { stop(); setVoiceName(e.target.value); localStorage.setItem('sankalpa_voice', e.target.value); }}>
                  {[...voices].sort((a, b) => rankVoice(b) - rankVoice(a)).map((v) => (
                    <option key={v.name} value={v.name}>{v.name.replace(/^Microsoft /, '')} · {v.lang}</option>
                  ))}
                </select>
              </>
            ) : 'Preparing voice…'}
        </div>
      </aside>
    </>
  );
}
