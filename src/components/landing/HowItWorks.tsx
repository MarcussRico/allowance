"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const ACTS = [
  {
    title: "Inside your limits, it just pays.",
    body: "The agent buys the week’s groceries. $17.07 fits every rule, so PayPal is charged straight away, from the account you saved once.",
  },
  {
    title: "Outside them, it asks you first.",
    body: "$89 headphones break two rules. The purchase waits and your phone lights up. A deliberate press-and-hold approves it. A tap doesn’t.",
  },
  {
    title: "Some things are never allowed.",
    body: "Betting credit is blocked outright. You aren’t asked, and nothing is charged.",
  },
  {
    title: "One tap turns it off.",
    body: "Revoke the allowance and its key stops working everywhere, at once. Anything still waiting for you is cancelled.",
  },
];

function SceneSlip({
  id,
  shop,
  amount,
  items,
  stamp,
  tone,
  children,
}: {
  id: string;
  shop: string;
  amount: string;
  items: string;
  stamp: string;
  tone: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`scene-slip scene-slip--${id}`} data-slip={id}>
      <p className="scene-slip__head">
        <span>{shop}</span>
        <span className="scene-slip__amount num">{amount}</span>
      </p>
      <p className="scene-slip__items">{items}</p>
      <span className={`paper-stamp paper-stamp--${tone}`} data-stamp={id}>
        {stamp}
      </span>
      {children}
    </div>
  );
}

export function HowItWorks() {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 960px) and (prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(scope);
        const balance = q("[data-scene-balance]")[0] as HTMLElement;
        const over = q("[data-scene-over]")[0] as HTMLElement;
        const money = { v: 60 };
        const show = () => {
          balance.textContent = `$${Math.max(0, money.v).toFixed(2)}`;
          over.textContent = money.v < 0 ? `$${(-money.v).toFixed(2)} over, with your approval` : "";
        };
        show();

        gsap.set(q("[data-slip]"), { xPercent: 0, opacity: 0, y: 18 });
        gsap.set(q("[data-stamp]"), { opacity: 0, scale: 1.3 });
        gsap.set(q("[data-glow]"), { opacity: 0 });
        gsap.set(q("[data-phone-done]"), { opacity: 0 });
        gsap.set(q("[data-act]"), { opacity: 0, y: 24 });
        gsap.set(q("[data-act='0']"), { opacity: 1, y: 0 });
        gsap.set(q("[data-phone]"), { yPercent: 30, opacity: 0 });
        gsap.set(q("[data-hold-fill]"), { clipPath: "inset(0 100% 0 0)" });
        gsap.set(q("[data-void]"), { opacity: 0, scale: 1.4 });

        const act = (n: number) =>
          gsap.timeline().to(q("[data-act]"), { opacity: 0, y: -16, duration: 0.3 }).fromTo(q(`[data-act='${n}']`), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4 }, "<0.15");
        const glow = (station: string, tone: string, on: boolean) =>
          gsap.to(q(`[data-station='${station}'] [data-glow='${tone}']`), { opacity: on ? 1 : 0, duration: 0.3 });

        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          scrollTrigger: { trigger: scope.current, start: "top top", end: "+=3600", pin: q(".how__pin")[0], scrub: 0.6, anticipatePin: 1 },
        });

        // Act 1: groceries pay.
        tl.to(q("[data-slip='a']"), { opacity: 1, y: 0, duration: 0.4 })
          .add(glow("agent", "live", true), "<")
          .to(q("[data-slip='a']"), { xPercent: 100, duration: 0.7 })
          .add(glow("agent", "live", false), "<")
          .add(glow("rules", "paid", true))
          .to(q("[data-slip='a']"), { xPercent: 200, duration: 0.7 }, "+=0.2")
          .add(glow("rules", "paid", false), "<")
          .add(glow("paypal", "paid", true))
          .to(q("[data-stamp='a']"), { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out" })
          .to(money, { v: 42.93, duration: 0.6, onUpdate: show }, "<")
          .to({}, { duration: 0.4 })
          // Act 2: headphones wait for you.
          .add(act(1))
          .add(glow("paypal", "paid", false), "<")
          .to(q("[data-slip='a']"), { opacity: 0, y: -14, duration: 0.3 }, "<")
          .to(q("[data-slip='b']"), { opacity: 1, y: 0, duration: 0.4 })
          .to(q("[data-slip='b']"), { xPercent: 100, duration: 0.7 })
          .add(glow("rules", "hold", true))
          .to(q("[data-stamp='b']"), { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out" })
          .to(q("[data-phone]"), { yPercent: 0, opacity: 1, duration: 0.6, ease: "power3.out" })
          .to(q("[data-hold-fill]"), { clipPath: "inset(0 0% 0 0)", duration: 1.1, ease: "none" })
          .to(q("[data-phone-done]"), { opacity: 1, duration: 0.2 })
          .to(q("[data-phone]"), { yPercent: 30, opacity: 0, duration: 0.5 }, "+=0.3")
          .add(glow("rules", "hold", false), "<")
          .to(q("[data-stamp='b']"), { opacity: 0, duration: 0.15 }, "<")
          .to(q("[data-slip='b']"), { xPercent: 200, duration: 0.7 })
          .add(glow("paypal", "paid", true))
          .to(q("[data-stamp='b2']"), { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out" })
          .to(money, { v: -46.07, duration: 0.6, onUpdate: show }, "<")
          .to({}, { duration: 0.4 })
          // Act 3: betting is blocked.
          .add(act(2))
          .add(glow("paypal", "paid", false), "<")
          .to(q("[data-slip='b']"), { opacity: 0, y: -14, duration: 0.3 }, "<")
          .to(q("[data-slip='c']"), { opacity: 1, y: 0, duration: 0.4 })
          .to(q("[data-slip='c']"), { xPercent: 100, duration: 0.7 })
          .add(glow("rules", "block", true))
          .to(q("[data-stamp='c']"), { opacity: 1, scale: 1, duration: 0.25, ease: "power2.out" })
          .to({}, { duration: 0.5 })
          // Act 4: revoke.
          .add(act(3))
          .add(glow("rules", "block", false), "<")
          .to(q("[data-slip='c']"), { opacity: 0, y: -14, duration: 0.3 }, "<")
          .to(q("[data-scene-note]"), { opacity: 0.55, duration: 0.4 })
          .to(q("[data-void]"), { opacity: 1, scale: 1, duration: 0.3, ease: "power2.out" }, "<0.1")
          .to({}, { duration: 0.6 });
      });
      return () => mm.revert();
    },
    { scope },
  );

  return (
    <section ref={scope} id="how" className="how" aria-labelledby="how-title">
      <div className="how__pin">
        <div className="how__copy">
          <p className="section-kicker">How it works</p>
          <h2 id="how-title" className="section-heading">
            Every purchase goes through your rules first.
          </h2>
          <div className="how__acts">
            {ACTS.map((a, i) => (
              <div key={a.title} className="how__act" data-act={i}>
                <h3>{a.title}</h3>
                <p>{a.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="how__scene" aria-hidden="true">
          <div className="scene-stations">
            <div className="scene-station" data-station="agent">
              <span className="scene-station__glow scene-station__glow--live" data-glow="live" />
              <span className="scene-station__glow scene-station__glow--paid" data-glow="paid" />
              <span className="scene-station__glow scene-station__glow--hold" data-glow="hold" />
              <span className="scene-station__glow scene-station__glow--block" data-glow="block" />
              <p className="scene-station__kicker">The agent asks</p>
              <p className="scene-station__name">Household agent</p>
              <p className="scene-station__fine">Holds a key, never a card</p>
            </div>
            <div className="scene-station" data-station="rules">
              <span className="scene-station__glow scene-station__glow--live" data-glow="live" />
              <span className="scene-station__glow scene-station__glow--paid" data-glow="paid" />
              <span className="scene-station__glow scene-station__glow--hold" data-glow="hold" />
              <span className="scene-station__glow scene-station__glow--block" data-glow="block" />
              <p className="scene-station__kicker">Your rules decide</p>
              <p className="scene-station__name">$60 a week</p>
              <p className="scene-station__fine">$30 each · groceries, books</p>
            </div>
            <div className="scene-station" data-station="paypal">
              <span className="scene-station__glow scene-station__glow--live" data-glow="live" />
              <span className="scene-station__glow scene-station__glow--paid" data-glow="paid" />
              <span className="scene-station__glow scene-station__glow--hold" data-glow="hold" />
              <span className="scene-station__glow scene-station__glow--block" data-glow="block" />
              <p className="scene-station__kicker">PayPal pays</p>
              <p className="scene-station__name">Saved once</p>
              <p className="scene-station__fine">Vault + Orders v2</p>
            </div>
          </div>

          <div className="scene-track">
            <span className="scene-track__rail" />
            <SceneSlip id="a" shop="Corner Grocer" amount="$17.07" items="Oat milk, eggs, sourdough" stamp="Paid" tone="paid" />
            <SceneSlip id="b" shop="Voltline Electronics" amount="$89.00" items="Noise-cancelling headphones" stamp="Waiting for you" tone="hold">
              <span className="paper-stamp paper-stamp--paid scene-slip__second" data-stamp="b2">
                Paid · you approved
              </span>
            </SceneSlip>
            <SceneSlip id="c" shop="LuckyLine Bets" amount="$20.00" items="Betting credit" stamp="Blocked" tone="block" />
          </div>

          <div className="scene-bottom">
            <div className="scene-note" data-scene-note>
              <p className="scene-note__label">Left this week</p>
              <p className="scene-note__balance num" data-scene-balance>
                $60.00
              </p>
              <p className="scene-note__over num" data-scene-over />
              <span className="scene-note__void" data-void>
                Void
              </span>
            </div>
            <div className="scene-phone" data-phone>
              <p className="scene-phone__ask">Household agent wants to spend</p>
              <p className="scene-phone__amount num">$89.00</p>
              <p className="scene-phone__why">Electronics · over $30 · past this week&rsquo;s cap</p>
              <div className="scene-phone__hold">
                <span className="scene-phone__fill" data-hold-fill />
                <span className="scene-phone__label">Hold to approve</span>
              </div>
              <p className="scene-phone__done" data-phone-done>
                Approved. PayPal charged.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Phones and reduced motion get the same story as a sequence of cards. */}
      <ol className="how__static">
        {ACTS.map((a, i) => (
          <li key={a.title} className={`how-card how-card--${["paid", "hold", "block", "void"][i]}`}>
            <span className="how-card__step">{["Paid", "Waiting for you", "Blocked", "Revoked"][i]}</span>
            <h3>{a.title}</h3>
            <p>{a.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
