"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import Link from "next/link";
import { useRef } from "react";
import SplitText from "../reactbits/SplitText";
import Threads from "../reactbits/Threads";
import { GuillocheFrame, GuillocheRosette } from "../Guilloche";

gsap.registerPlugin(useGSAP);

/** A live allowance on the right of the hero: one grocery slip pays, the balance counts down. Plays once. */
function HeroNote() {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const balance = scope.current!.querySelector<HTMLElement>("[data-balance]")!;
      const spent = scope.current!.querySelector<HTMLElement>("[data-spent]")!;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const show = (v: number) => {
        balance.textContent = `$${v.toFixed(2)}`;
        spent.style.transform = `scaleX(${(60 - v) / 60})`;
      };
      if (reduce) {
        show(42.93);
        gsap.set("[data-slip]", { opacity: 1 });
        return;
      }
      const money = { v: 60 };
      show(60);
      gsap
        .timeline({ delay: 1.1 })
        .fromTo("[data-slip]", { y: 26, opacity: 0, rotate: -2 }, { y: 0, opacity: 1, rotate: -2, duration: 0.6, ease: "power3.out" })
        .fromTo("[data-stamp]", { opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out" }, "+=0.35")
        .to(money, { v: 42.93, duration: 1.1, ease: "power2.inOut", onUpdate: () => show(money.v) }, "<");
    },
    { scope },
  );

  return (
    <div ref={scope} className="hero-note" aria-label="An example allowance: $42.93 left of $60.00 this week, after a $17.07 grocery purchase was paid.">
      <div className="hero-note__card">
        <GuillocheFrame seed="hero-note" />
        <div className="hero-note__mark">
          <GuillocheRosette seed="hero-note" size={170} />
        </div>
        <p className="hero-note__for">Allowance for Household agent</p>
        <p className="hero-note__name">Weekly groceries and books</p>
        <p className="hero-note__balance num" data-balance>
          $60.00
        </p>
        <p className="hero-note__of">left of $60.00 this week</p>
        <div className="hero-note__meter" aria-hidden="true">
          <span data-spent />
        </div>
        <dl className="hero-note__rules">
          <div>
            <dt>Each purchase</dt>
            <dd>up to $30</dd>
          </div>
          <div>
            <dt>Without asking</dt>
            <dd>Groceries, books</dd>
          </div>
        </dl>
      </div>
      <div className="hero-note__slip" data-slip>
        <p className="hero-note__shop">
          Corner Grocer <span className="num">$17.07</span>
        </p>
        <p className="hero-note__items">2 × Oat milk · Eggs · Sourdough</p>
        <span className="paper-stamp paper-stamp--paid" data-stamp>
          Paid
        </span>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__threads" aria-hidden="true">
        <Threads color="#c9a55e" accentColor="#3c5a9a" amplitude={1.15} distance={0.25} lineCount={56} thickness={0.45} speed={0.35} angle={-6} fade={0.35} opacity={0.75} brightness={1.1} />
      </div>
      <div className="hero__inner">
        <div className="hero__copy">
          <p className="hero__eyebrow">
            <span className="hero__dot" aria-hidden="true" />
            Built on PayPal for the PayPal AI Hackathon
          </p>
          <h1 id="hero-title" className="hero__title" aria-label="Give your agent an allowance. Not your card.">
            <SplitText tag="span" text="Give your agent an allowance." className="hero__line" splitType="words" delay={70} duration={1} trigger="load" textAlign="left" />
            <SplitText tag="span" text="Not your card." className="hero__line hero__line--serif" splitType="words" delay={90} duration={1.1} trigger="load" textAlign="left" />
          </h1>
          <p className="hero__lede">
            Your AI agent shops within limits you set and pays through PayPal. Anything outside them waits for you to approve, on your phone, with one deliberate press.
          </p>
          <div className="hero__ctas">
            <Link className="btn btn--big" href="/app">
              Open the live demo <span className="btn__arrow">→</span>
            </Link>
            <a className="btn btn--big btn--quiet" href="#how">
              See how it works
            </a>
          </div>
          <p className="hero__fine">No sign-up. The demo uses PayPal&rsquo;s sandbox, so no real money moves.</p>
        </div>
        <HeroNote />
      </div>
    </section>
  );
}
