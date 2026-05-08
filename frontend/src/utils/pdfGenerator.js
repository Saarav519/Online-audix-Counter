import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Branded PDF export for Audix reports.
 *
 * generatePDF({
 *   title:       'Variance Report',
 *   subtitle:    'Reliance Retail · July 2026 Audit',
 *   meta:        { 'Client': 'Reliance Retail', ... },
 *   summary:     [{ label: 'Expected', value: 15420 }, ... ],
 *   tableHead:   [['Location', 'Barcode', 'Description', ...]],
 *   tableBody:   rows,
 *   columnsMeta: [{ key, label, numeric }, ...]   // optional — when provided,
 *                // numeric columns get right-aligned, fixed narrow widths and
 *                // wide text columns (description/remark/category) get a sensible
 *                // max width so the layout stays clean across reports.
 *   filename:    'variance-report.pdf',
 * });
 */
export function generatePDF({
  title = 'Audit Report',
  subtitle = '',
  meta = {},
  summary = [],
  tableHead = [],
  tableBody = [],
  columnsMeta = null,
  filename = 'audix-report.pdf',
  orientation = 'landscape',
  brandName = 'AudiX Solutions & Co.',
  brandTag = 'Chartered Accountants · Audit Data Management',
}) {
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ─── Branded Header Band ───
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(0, 0, pageWidth, 60, 'F');

  // Logo square (monogram)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(32, 18, 28, 28, 4, 4, 'F');
  doc.setTextColor(16, 185, 129);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('A', 46, 38, { align: 'center' });

  // Brand text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(brandName, 72, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(brandTag, 72, 44);

  // Right side: generated timestamp
  doc.setFontSize(8);
  doc.text(
    `Generated: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
    pageWidth - 32, 40, { align: 'right' }
  );

  let cursorY = 90;

  // ─── Report Title ───
  doc.setTextColor(30, 41, 59); // slate-800
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(title, 32, cursorY);
  cursorY += 8;

  // Accent underline
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(2);
  doc.line(32, cursorY, 90, cursorY);
  cursorY += 16;

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(subtitle, 32, cursorY);
    cursorY += 20;
  }

  // ─── Meta Info Box ───
  const metaEntries = Object.entries(meta);
  if (metaEntries.length > 0) {
    const boxY = cursorY;
    const boxHeight = 18 + Math.ceil(metaEntries.length / 2) * 16;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(32, boxY, pageWidth - 64, boxHeight, 4, 4, 'FD');

    doc.setFontSize(9);
    metaEntries.forEach(([key, value], idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = 44 + col * ((pageWidth - 64) / 2);
      const y = boxY + 16 + row * 16;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text(`${key}:`, x, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(String(value), x + 60, y);
    });
    cursorY = boxY + boxHeight + 18;
  }

  // ─── Summary KPI Cards ───
  if (summary.length > 0) {
    const cardWidth = (pageWidth - 64 - (summary.length - 1) * 10) / summary.length;
    summary.forEach((stat, idx) => {
      const x = 32 + idx * (cardWidth + 10);
      const kpiColor = stat.color === 'rose' ? [244, 63, 94]
                       : stat.color === 'amber' ? [245, 158, 11]
                       : stat.color === 'blue' ? [59, 130, 246]
                       : stat.color === 'slate' ? [71, 85, 105]
                       : [16, 185, 129]; // emerald default
      doc.setFillColor(kpiColor[0], kpiColor[1], kpiColor[2], 0.08);
      doc.setDrawColor(kpiColor[0], kpiColor[1], kpiColor[2]);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, cursorY, cardWidth, 50, 4, 4, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(String(stat.label).toUpperCase(), x + 8, cursorY + 14);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(kpiColor[0], kpiColor[1], kpiColor[2]);
      doc.text(String(stat.value), x + 8, cursorY + 36);
    });
    cursorY += 70;
  }

  // ─── Build columnStyles for clean alignment & widths ───
  // Numeric columns → right-align, narrow fixed width.
  // Wide text columns (description/remark/category/article_name) → bigger min,
  // wrapped text. Identifier columns (location/barcode/article_code) → mono-ish
  // narrower so they don't dominate the row.
  const columnStyles = {};
  if (columnsMeta && columnsMeta.length) {
    columnsMeta.forEach((c, idx) => {
      const k = (c.key || '').toLowerCase();
      let style = { halign: 'left' };
      if (c.numeric) {
        style = { halign: 'right', cellWidth: k.includes('value') ? 70 : 50 };
      } else if (k === 'description' || k === 'remark' || k === 'article_name') {
        style = { halign: 'left', cellWidth: 'auto', overflow: 'linebreak' };
      } else if (k === 'category') {
        style = { halign: 'left', cellWidth: 70, overflow: 'linebreak' };
      } else if (k === 'location' || k === 'barcode' || k === 'article_code' || k === 'status') {
        style = { halign: 'left', cellWidth: 60, overflow: 'linebreak', font: 'courier', fontSize: 7.5 };
      }
      columnStyles[idx] = style;
    });
  }

  // ─── Main Data Table ───
  if (tableHead.length > 0 && tableBody.length > 0) {
    autoTable(doc, {
      startY: cursorY,
      head: tableHead,
      body: tableBody,
      theme: 'grid',
      tableWidth: 'auto',
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        cellPadding: 5,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [30, 41, 59],
        cellPadding: 3,
        valign: 'middle',
        overflow: 'linebreak',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: {
        lineColor: [226, 232, 240],
        lineWidth: 0.3,
        cellPadding: 3,
        overflow: 'linebreak',
        minCellHeight: 14,
      },
      columnStyles,
      margin: { left: 32, right: 32 },
      didDrawPage: (data) => {
        // Footer on every page
        const pageNumber = doc.internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(
          `${brandName} · Confidential`,
          32, pageHeight - 16
        );
        doc.text(
          `Page ${data.pageNumber} of ${pageNumber}`,
          pageWidth - 32, pageHeight - 16, { align: 'right' }
        );
      },
    });
  }

  doc.save(filename);
}
