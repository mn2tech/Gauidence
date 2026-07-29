"use client";

import { useState } from "react";
import {
  PAYROLL_STATUS_COLORS,
  PAYROLL_STATUS_LABELS,
  type PayrollReportStatus,
} from "@/lib/payroll/types";

type Props = {
  status: PayrollReportStatus;
  className?: string;
};

export default function PayrollStatusBadge({ status, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${PAYROLL_STATUS_COLORS[status]} ${className}`}
    >
      {PAYROLL_STATUS_LABELS[status]}
    </span>
  );
}
