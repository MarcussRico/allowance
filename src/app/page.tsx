import type { Metadata } from "next";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Developers, FinalCta, Footer, Nav, Numbers, OnPayPal, Problem, Safety } from "@/components/landing/Sections";
import "@/components/landing/landing.css";

export const metadata: Metadata = {
  title: "Allowance: give your AI agent an allowance, not your card",
};

export default function Landing() {
  return (
    <>
      <Nav />
      <main className="landing">
        <Hero />
        <Problem />
        <HowItWorks />
        <Safety />
        <Numbers />
        <OnPayPal />
        <Developers />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
