"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CreditCard, Download, ReceiptText, TrendingUp } from "lucide-react";
import { fetchOrders, type Order } from "../lib/dynamodb";
import { useTranslation } from "../i18n/LanguageProvider";

type Period = "today" | "week" | "month";

const money = (value: number) => value.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 });

function dateOf(order: Order): Date {
  return new Date(order.paidAt ?? order.createdAt);
}

function isRecordedSale(order: Order): boolean {
  return order.status === "paid" && order.source !== "uber-eats";
}

function csvCell(value: string | number | undefined): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startFor(period: Period) {
  const date = startOfToday();
  if (period === "week") date.setDate(date.getDate() - 6);
  if (period === "month") date.setDate(1);
  return date;
}

function dayLabel(date: Date, period: Period) {
  return period === "month"
    ? date.toLocaleDateString("es-MX", { day: "numeric" })
    : date.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "");
}

export function SalesReportPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("month");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await fetchOrders();
        if (active) { setOrders(result); setError(false); }
      } catch (err) {
        console.error("Failed to load sales report:", err);
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const report = useMemo(() => {
    const start = startFor(period);
    const sales = orders.filter((order) => isRecordedSale(order) && dateOf(order) >= start);
    const gross = sales.reduce((sum, order) => sum + (order.total ?? 0), 0);
    const tips = sales.reduce((sum, order) => sum + (order.tip ?? 0), 0);
    const payment = sales.reduce<Record<string, number>>((result, order) => {
      result[order.paymentMethod] = (result[order.paymentMethod] ?? 0) + (order.total ?? 0);
      return result;
    }, {});
    const items = new Map<string, { quantity: number; sales: number }>();
    sales.forEach((order) => order.items.forEach((item) => {
      const current = items.get(item.name) ?? { quantity: 0, sales: 0 };
      current.quantity += item.quantity;
      current.sales += item.quantity * item.unitPrice;
      items.set(item.name, current);
    }));
    const days: Array<{ date: Date; amount: number }> = [];
    const cursor = new Date(start);
    const end = startOfToday();
    while (cursor <= end) {
      const dayStart = new Date(cursor);
      const next = new Date(cursor); next.setDate(next.getDate() + 1);
      days.push({ date: dayStart, amount: sales.filter((order) => dateOf(order) >= dayStart && dateOf(order) < next).reduce((sum, order) => sum + order.total, 0) });
      cursor.setDate(cursor.getDate() + 1);
    }
    return {
      sales, gross, tips, payment,
      average: sales.length ? gross / sales.length : 0,
      days,
      maxDay: Math.max(...days.map((day) => day.amount), 1),
      items: [...items.entries()].map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.sales - a.sales).slice(0, 5),
    };
  }, [orders, period]);

  const periods: Array<{ key: Period; label: string }> = [
    { key: "today", label: t("reports.today") }, { key: "week", label: t("reports.last7Days") }, { key: "month", label: t("reports.thisMonth") },
  ];

  function exportOrders() {
    const headers = ["Date", "Order ID", "Server", "Table", "Service", "Payment method", "Subtotal", "Discount", "Fee", "Tax", "Tip", "Total", "Items"];
    const rows = report.sales.map((order) => [
      dateOf(order).toLocaleString("sv-SE"), order.saleCode ?? order.id, order.server, order.tableLabel,
      order.serviceType ?? "dine-in", order.paymentMethod, order.subtotal, order.discount ?? 0,
      order.fee ?? 0, order.tax, order.tip, order.total,
      order.items.map((item) => `${item.quantity}× ${item.name}`).join("; "),
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-orders-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <section className="page sales-report-page">
    <header className="page-header sales-report-header">
      <div><p className="eyebrow">{t("reports.eyebrow")}</p><h1>{t("reports.salesTitle")}</h1><p className="page-subtitle">{t("reports.salesSubtitle")}</p></div>
      <div className="sales-report-actions">
        <button className="report-export" onClick={exportOrders} disabled={loading || report.sales.length === 0}><Download size={15} />{t("reports.exportOrders")}</button>
        <div className="report-period" role="group" aria-label={t("reports.period")}>
          <CalendarDays size={16} aria-hidden="true" />
          {periods.map((item) => <button key={item.key} onClick={() => setPeriod(item.key)} className={period === item.key ? "active" : ""}>{item.label}</button>)}
        </div>
      </div>
    </header>

    {error ? <div className="report-message">{t("reports.loadError")}</div> : <>
      <div className="report-metrics">
        <article><span className="report-icon blue"><TrendingUp size={19} /></span><small>{t("reports.netSales")}</small><strong>{money(report.gross)}</strong><p>{t("reports.fromPaidOrders", { count: String(report.sales.length) })}</p></article>
        <article><span className="report-icon coral"><ReceiptText size={19} /></span><small>{t("reports.orders")}</small><strong>{report.sales.length}</strong><p>{t("reports.averageTicket", { amount: money(report.average) })}</p></article>
        <article><span className="report-icon mint"><CreditCard size={19} /></span><small>{t("reports.tips")}</small><strong>{money(report.tips)}</strong><p>{t("reports.tipRate", { rate: report.gross ? `${Math.round((report.tips / report.gross) * 100)}%` : "—" })}</p></article>
      </div>

      <div className="sales-report-grid">
        <article className="report-card sales-chart-card">
          <div className="card-head"><div><h2>{t("reports.dailySales")}</h2><p>{t("reports.dailySalesHint")}</p></div><strong>{money(report.gross)}</strong></div>
          {loading ? <p className="report-message">{t("reports.loading")}</p> : <div className="sales-bars" aria-label={t("reports.dailySales")}>
            {report.days.map((day) => <div className="sales-bar-column" key={day.date.toISOString()} title={`${day.date.toLocaleDateString("es-MX")}: ${money(day.amount)}`}><span>{day.amount ? money(day.amount) : ""}</span><i style={{ height: `${Math.max(day.amount ? 5 : 1, (day.amount / report.maxDay) * 100)}%` }} /><small>{dayLabel(day.date, period)}</small></div>)}
          </div>}
        </article>
        <article className="report-card payment-card"><div className="card-head"><div><h2>{t("reports.paymentMix")}</h2><p>{t("reports.paymentMixHint")}</p></div></div>
          <div className="payment-list">{(["cash", "card", "transfer", "other"] as const).map((method) => { const amount = report.payment[method] ?? 0; const percent = report.gross ? Math.round((amount / report.gross) * 100) : 0; return <div key={method}><span><i className={`payment-dot ${method}`} />{t(`reports.payment.${method}`)}</span><b>{money(amount)} <small>{percent}%</small></b></div>; })}</div>
        </article>
      </div>
      <article className="report-card report-items-card"><div className="card-head"><div><h2>{t("reports.topItems")}</h2><p>{t("reports.topItemsHint")}</p></div></div>
        <div className="report-table-wrap"><table className="page-table"><thead><tr><th>{t("reports.item")}</th><th>{t("reports.quantity")}</th><th>{t("reports.sales")}</th><th>{t("reports.share")}</th></tr></thead><tbody>
          {report.items.length ? report.items.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td>{item.quantity}</td><td>{money(item.sales)}</td><td>{report.gross ? Math.round((item.sales / report.gross) * 100) : 0}%</td></tr>) : <tr><td colSpan={4} className="no-results">{t("reports.noSales")}</td></tr>}
        </tbody></table></div>
      </article>
    </>}
  </section>;
}
