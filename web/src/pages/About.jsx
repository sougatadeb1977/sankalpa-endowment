import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Head, Icon, Modal, useReveal, useApi } from '../lib.jsx';

const FILM = 'k493mHHWTfw';

const TIMELINE = [
  ['1981', 'The Art of Living Foundation is founded in Bengaluru, and the Sudarshan Kriya breathing technique is first taught.'],
  ['1997', 'The International Association for Human Values is founded in Geneva to carry the work into conflict zones and development.'],
  ['2004', 'Trauma-relief teams deploy after the Indian Ocean tsunami — the beginning of four decades of disaster response.'],
  ['2006', 'Prison programmes reach tens of thousands of inmates across India, and later the United States and Europe.'],
  ['2008', 'Peace facilitation work in Sri Lanka, Colombia, Iraq and Kosovo, at the invitation of governments and communities.'],
  ['2016', 'The World Culture Festival on the banks of the Yamuna draws over 3.5 million people — among the largest peaceful gatherings in human history.'],
  ['2020', 'Free online breathing and meditation programmes reach millions during the pandemic.'],
  ['2026', 'The Sankalpa endowment campaign begins: $45 million, raised once, to secure the work permanently.'],
];

export default function About() {
  const [film, setFilm] = useState(false);
  const { data: quotes } = useApi('/quotes');
  useReveal();
  return (
    <>
      <section style={{ position: 'relative', background: 'var(--lotus)', borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
        <div className="wrap" style={{ paddingTop: 100, paddingBottom: 96, position: 'relative', zIndex: 2 }}>
          <div className="grid g2" style={{ gap: 60, alignItems: 'center' }}>
            <div>
              <div className="overline">About Gurudev</div>
              <h1 className="display" style={{ fontSize: 'clamp(2.2rem,4.6vw,3.7rem)', marginBottom: 24, color: 'var(--indigo)' }}>
                A teacher, a humanitarian,<br />and a stubborn optimist.
              </h1>
              <p className="lede">
                Gurudev Sri Sri Ravi Shankar has spent forty-five years making one argument: that a mind at
                peace is not a luxury, and that a violence-free society begins inside individual people, one
                breath at a time. Eight hundred million lives later, the argument is difficult to dismiss.
              </p>
              <div className="row" style={{ marginTop: 30 }}>
                <button className="btn btn-gold" onClick={() => setFilm(true)}>
                  <Icon.play width={15} height={15} /> Watch the film
                </button>
                <Link to="/give" className="btn btn-ghost">Support the work</Link>
              </div>
            </div>
            <div className="reveal">
              <button onClick={() => setFilm(true)} style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer', width: '100%' }}>
                <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden', border: '1px solid var(--border-strong)' }}>
                  <img src={`https://img.youtube.com/vi/${FILM}/maxresdefault.jpg`} alt="Gurudev Sri Sri Ravi Shankar"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                    <span style={{
                      width: 68, height: 68, borderRadius: '50%', background: 'rgba(212,134,11,.94)',
                      display: 'grid', placeItems: 'center', color: '#fff', paddingLeft: 5,
                    }}><Icon.play width={26} height={26} /></span>
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="grid g3" style={{ gap: 44 }}>
            {[
              ['The practice', 'Sudarshan Kriya is a rhythmic breathing technique, studied in more than a hundred independent papers for its effect on anxiety, depression and post-traumatic stress. It is taught to anyone, in any country, regardless of belief or ability to pay.'],
              ['The service', 'Free schools for 100,000 rural children. Trauma relief for veterans and survivors. Disaster deployment from Hurricane Katrina to the Haiti earthquake. River rejuvenation, organic farming, prison programmes, youth leadership.'],
              ['The peace work', 'Gurudev has personally facilitated dialogue in Sri Lanka, Colombia, Iraq and Kosovo — often between people who would not otherwise be in a room together. He holds no political office and takes no side.'],
            ].map(([h, p]) => (
              <div key={h} className="reveal">
                <div className="overline">{h}</div>
                <p className="muted">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-warm">
        <div className="wrap">
          <Head over="Forty-five years" title="A short history of quiet work" />
          <div style={{ maxWidth: 820 }}>
            {TIMELINE.map(([y, t]) => (
              <div key={y} className="reveal" style={{ display: 'flex', gap: 34, padding: '24px 0', borderTop: '1px solid var(--border)' }}>
                <div className="serif-num" style={{ fontSize: 30, color: 'var(--saffron)', fontWeight: 600, flex: 'none', width: 88, lineHeight: 1.1 }}>{y}</div>
                <p style={{ marginBottom: 0, fontSize: 15.5 }}>{t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {quotes && (
        <section className="section section-indigo">
          <div className="wrap">
            <Head center light over="In his own words" title="Wisdom, offered freely" />
            <div className="grid g3">
              {quotes.slice(0, 6).map((q) => (
                <blockquote key={q.id} className="reveal" style={{
                  margin: 0, borderLeft: '2px solid var(--saffron)', paddingLeft: 22,
                }}>
                  <p className="quote" style={{ fontSize: 19, marginBottom: 12 }}>“{q.text}”</p>
                  <cite className="tiny" style={{ fontStyle: 'normal', color: 'var(--earth)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
                    {q.attribution}
                  </cite>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section" style={{ textAlign: 'center' }}>
        <div className="wrap narrow">
          <h2 className="h-section" style={{ marginBottom: 22 }}>
            The work does not end with him. That is rather the point.
          </h2>
          <p className="lede">
            An endowment is how a mission outlives its founder. Give today, or write the Foundation into your
            will and give nothing at all until you no longer need it.
          </p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 32 }}>
            <Link to="/give" className="btn btn-gold">Give now</Link>
            <Link to="/planned-giving" className="btn btn-ghost">Leave a legacy</Link>
          </div>
        </div>
      </section>

      {film && (
        <Modal onClose={() => setFilm(false)}>
          <div className="ratio-16x9">
            <iframe title="Gurudev Sri Sri Ravi Shankar"
              src={`https://www.youtube.com/embed/${FILM}?autoplay=1&rel=0&modestbranding=1`}
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          </div>
        </Modal>
      )}
    </>
  );
}
