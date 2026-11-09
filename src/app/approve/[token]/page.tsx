import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ApproveCard } from "@/components/ApproveCard";
import { expireStaleHolds, getAllowance, purchaseForToken, withoutToken } from "@/lib/store";

export const metadata: Metadata = { title: "Approve a purchase · Allowance", robots: { index: false } };

async function Approval({ params }: { params: PageProps<"/approve/[token]">["params"] }) {
  const { token } = await params;
  await connection();
  expireStaleHolds();
  const p = purchaseForToken(token);
  if (!p) {
    return (
      <main className="approve">
        <section className="approve__card">
          <h1 className="approve__title">This link isn&rsquo;t valid</h1>
          <p className="approve__sub">Approval links work once and expire after 30 minutes. Open the request again from your dashboard.</p>
        </section>
      </main>
    );
  }
  const a = getAllowance(p.allowanceId)!;
  return <ApproveCard token={token} purchase={withoutToken(p)} allowance={{ name: a.name, agentName: a.agentName, status: a.status }} />;
}

export default function ApprovePage({ params }: PageProps<"/approve/[token]">) {
  return (
    <Suspense fallback={<p className="boot">Opening the request…</p>}>
      <Approval params={params} />
    </Suspense>
  );
}
