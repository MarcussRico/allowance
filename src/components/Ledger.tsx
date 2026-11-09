"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useState } from "react";
import type { DashboardState } from "@/lib/view";
import { money, STATUS_LABEL } from "./format";

ModuleRegistry.registerModules([AllCommunityModule]);

type PurchaseView = DashboardState["purchases"][number];

const ledgerTheme = themeQuartz.withParams({
  backgroundColor: "#f7f8f3",
  foregroundColor: "#15211b",
  accentColor: "#2d4a8a",
  borderColor: "#d6ddd1",
  headerBackgroundColor: "#e9ede4",
  headerTextColor: "#46544c",
  headerFontWeight: 600,
  oddRowBackgroundColor: "#f2f4ee",
  rowHoverColor: "#e6ebf3",
  fontFamily: "var(--font-sans)",
  fontSize: 13.5,
  wrapperBorderRadius: 10,
  spacing: 7,
});

function StatusCell({ data }: ICellRendererParams<PurchaseView>) {
  if (!data) return null;
  return (
    <span className={`pill pill--${data.status}`}>
      {STATUS_LABEL[data.status] ?? data.status}
      {data.approvedByOwner && data.status === "completed" ? " · you approved" : ""}
    </span>
  );
}

export function Ledger({ purchases, agentNames }: { purchases: PurchaseView[]; agentNames: Record<string, string> }) {
  const [filter, setFilter] = useState("");
  const rows = useMemo(
    () =>
      purchases.map((p) => ({
        ...p,
        agent: agentNames[p.allowanceId] ?? "Agent",
        items: p.lines.map((l) => `${l.qty} × ${l.name}`).join(", "),
        why: p.reasons.length ? p.reasons.join(" ") : p.error ?? "",
      })),
    [purchases, agentNames],
  );

  const columns = useMemo<ColDef<(typeof rows)[number]>[]>(
    () => [
      {
        field: "createdAt",
        headerName: "When",
        width: 118,
        sort: "desc",
        valueFormatter: (p) =>
          new Date(p.value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      },
      { field: "agent", headerName: "Agent", width: 140 },
      { field: "merchantName", headerName: "Shop", width: 160 },
      { field: "items", headerName: "Items", flex: 1, minWidth: 180, tooltipField: "items" },
      {
        field: "amountCents",
        headerName: "Amount",
        width: 110,
        type: "rightAligned",
        valueFormatter: (p) => money(p.value),
        cellClass: "num",
      },
      { field: "status", headerName: "Outcome", width: 176, cellRenderer: StatusCell },
      { field: "why", headerName: "Why", flex: 1, minWidth: 180, tooltipField: "why" },
      {
        field: "paypalOrderId",
        headerName: "PayPal order",
        width: 172,
        cellClass: "mono",
        valueFormatter: (p) => p.value ?? "—",
      },
    ],
    [],
  );

  return (
    <section className="ledger" aria-labelledby="ledger-title">
      <div className="ledger__head">
        <h2 id="ledger-title" className="section-title">
          Every agent purchase
        </h2>
        <label className="ledger__search">
          <span className="visually-hidden">Search purchases</span>
          <input type="search" placeholder="Search shops, items, outcomes" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
      </div>
      <div className="ledger__grid">
        <AgGridReact
          theme={ledgerTheme}
          rowData={rows}
          columnDefs={columns}
          getRowId={(p) => p.data.id}
          quickFilterText={filter}
          domLayout="autoHeight"
          pagination={rows.length > 12}
          paginationPageSize={12}
          paginationPageSizeSelector={false}
          tooltipShowDelay={300}
          suppressCellFocus
          overlayNoRowsTemplate="<span style='padding:12px'>No purchases yet. Send the agent a task.</span>"
        />
      </div>
    </section>
  );
}
