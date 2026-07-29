"use client";

import { AlertTriangle } from "lucide-react";
import type { PayrollReportEntry } from "@/lib/payroll/types";

type Props = {
  entries: PayrollReportEntry[];
  editable?: boolean;
  onUpdateEntry?: (
    entryId: string,
    updates: {
      adjustmentHours?: number;
      adjustmentReason?: string | null;
      ownerNotes?: string | null;
    }
  ) => void;
};

export default function PayrollEmployeeTable({
  entries,
  editable = false,
  onUpdateEntry,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-700">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-stone-700 bg-stone-800/80 text-left text-xs uppercase tracking-wide text-stone-400">
            <th className="px-4 py-3">Employee</th>
            <th className="px-4 py-3">Payroll ID</th>
            <th className="px-4 py-3 text-right">Regular</th>
            <th className="px-4 py-3 text-right">Overtime</th>
            <th className="px-4 py-3 text-right">Adjustments</th>
            <th className="px-4 py-3 text-right">Total</th>
            <th className="px-4 py-3">Notes</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.id}
              className="border-b border-stone-800 text-stone-200 last:border-0"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {e.missing_clock_out ? (
                    <span title="Missing clock-out" className="inline-flex">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                    </span>
                  ) : null}
                  <span className="font-medium">{e.employee_name}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-stone-400">
                {e.payroll_employee_id ?? "—"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{e.regular_hours}</td>
              <td className="px-4 py-3 text-right tabular-nums">{e.overtime_hours}</td>
              <td className="px-4 py-3 text-right">
                {editable && onUpdateEntry ? (
                  <input
                    type="number"
                    step="0.25"
                    defaultValue={e.adjustment_hours}
                    onBlur={(ev) => {
                      const val = parseFloat(ev.target.value) || 0;
                      if (val !== e.adjustment_hours) {
                        onUpdateEntry(e.id, { adjustmentHours: val });
                      }
                    }}
                    className="w-20 rounded border border-stone-600 bg-stone-800 px-2 py-1 text-right text-stone-100"
                  />
                ) : (
                  <span className="tabular-nums">{e.adjustment_hours}</span>
                )}
              </td>
              <td className="px-4 py-3 text-right font-medium tabular-nums">
                {Number(e.total_hours) + Number(e.adjustment_hours)}
              </td>
              <td className="px-4 py-3 text-stone-400">
                {editable && onUpdateEntry ? (
                  <input
                    type="text"
                    defaultValue={e.adjustment_reason ?? ""}
                    placeholder="Adjustment reason"
                    onBlur={(ev) => {
                      const val = ev.target.value.trim() || null;
                      if (val !== (e.adjustment_reason ?? null)) {
                        onUpdateEntry(e.id, { adjustmentReason: val });
                      }
                    }}
                    className="w-full min-w-[120px] rounded border border-stone-600 bg-stone-800 px-2 py-1 text-stone-100"
                  />
                ) : (
                  e.adjustment_reason ?? e.owner_notes ?? "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
