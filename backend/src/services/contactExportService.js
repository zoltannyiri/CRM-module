import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const columns = [
  { header: "Vezetéknév", key: "lastName", width: 22 },
  { header: "Keresztnév", key: "firstName", width: 22 },
  { header: "Partner", key: "partner", width: 30 },
  { header: "Partner típusa", key: "partnerType", width: 18 },
  { header: "Beosztás", key: "position", width: 24 },
  { header: "Email", key: "email", width: 30 },
  { header: "Telefon", key: "phone", width: 20 },
  { header: "Megjegyzés", key: "note", width: 35 },
];

const contactRow = (contact) => ({
  lastName: contact.lastName,
  firstName: contact.firstName,
  partner: contact.partner.name,
  partnerType: contact.partner.type === "COMPANY" ? "Cég" : "Magánszemély",
  position: contact.position || "",
  email: contact.email || "",
  phone: contact.phone || "",
  note: contact.note || "",
});

const buildExcel = async (contacts) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Saját CRM";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Kapcsolattartók", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = columns;
  contacts.map(contactRow).forEach((row) => sheet.addRow(row));
  sheet.autoFilter = { from: "A1", to: "H1" };
  sheet.getRow(1).height = 24;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF263B40" } };
    cell.alignment = { vertical: "middle" };
  });
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true };
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const csvValue = (value) => {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

const buildCsv = (contacts) => {
  const rows = [
    columns.map(({ header }) => csvValue(header)).join(";"),
    ...contacts.map((contact) => {
      const row = contactRow(contact);
      return columns.map(({ key }) => csvValue(row[key])).join(";");
    }),
  ];
  return Buffer.from(`\uFEFF${rows.join("\r\n")}`, "utf8");
};

const buildPdf = (contacts, organizationName) => new Promise((resolve, reject) => {
  const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 32 });
  const chunks = [];
  const widths = [82, 82, 115, 70, 90, 120, 88, 115];
  const startX = document.page.margins.left;
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);

  document.on("data", (chunk) => chunks.push(chunk));
  document.on("end", () => resolve(Buffer.concat(chunks)));
  document.on("error", reject);
  document.font("Helvetica-Bold").fontSize(17).fillColor("#253338").text("Kapcsolattartók");
  document.font("Helvetica").fontSize(8).fillColor("#71807c")
    .text(`${organizationName} • Exportálva: ${new Intl.DateTimeFormat("hu-HU").format(new Date())}`);
  document.moveDown(1.2);

  const drawHeader = () => {
    const y = document.y;
    document.rect(startX, y, tableWidth, 24).fill("#263B40");
    let x = startX;
    columns.forEach(({ header }, index) => {
      document.font("Helvetica-Bold").fontSize(7).fillColor("#FFFFFF").text(header, x + 4, y + 8, { width: widths[index] - 8, height: 12 });
      x += widths[index];
    });
    document.y = y + 24;
  };

  drawHeader();
  contacts.map(contactRow).forEach((row, rowIndex) => {
    const values = columns.map(({ key }) => String(row[key] ?? "").replace(/\s+/g, " ").trim());
    const rowHeight = Math.max(25, ...values.map((value, index) => document.heightOfString(value, { width: widths[index] - 8, height: 48 }))) + 8;
    if (document.y + rowHeight > document.page.height - document.page.margins.bottom) {
      document.addPage();
      drawHeader();
    }
    const y = document.y;
    document.rect(startX, y, tableWidth, rowHeight).fill(rowIndex % 2 ? "#F7F9F8" : "#FFFFFF");
    let x = startX;
    values.forEach((value, index) => {
      document.font("Helvetica").fontSize(7).fillColor("#344247").text(value, x + 4, y + 6, { width: widths[index] - 8, height: rowHeight - 10, ellipsis: true });
      document.rect(x, y, widths[index], rowHeight).strokeColor("#DDE4E2").lineWidth(0.4).stroke();
      x += widths[index];
    });
    document.y = y + rowHeight;
  });
  if (contacts.length === 0) {
    document.font("Helvetica").fontSize(9).fillColor("#71807c").text("Nincs exportálható kapcsolattartó.", startX, document.y + 14);
  }
  document.end();
});

export const buildContactExport = async ({ format, contacts, organizationName }) => {
  if (format === "xlsx") return buildExcel(contacts);
  if (format === "csv") return buildCsv(contacts);
  if (format === "pdf") return buildPdf(contacts, organizationName);
  throw new Error("Nem támogatott export formátum.");
};

export const contactExportContentTypes = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
};
