"use client";

export default function PrintReportButton() {
  return <button type="button" className="secondary-button" onClick={() => window.print()}>Print / Save as PDF</button>;
}
