import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

const columns = [
  { header: "Partner neve", key: "name", width: 28 },
  { header: "Típus", key: "type", width: 16 },
  { header: "Email", key: "email", width: 30 },
  { header: "Telefon", key: "phone", width: 20 },
  { header: "Weboldal", key: "website", width: 24 },
  { header: "Adószám", key: "taxNumber", width: 20 },
  { header: "Cím", key: "address", width: 34 },
  { header: "Kapcsolattartó", key: "contact", width: 25 },
  { header: "Megjegyzés", key: "note", width: 34 },
];

const partnerRow = (partner) => ({
  name: partner.name,
  type: partner.type === "COMPANY" ? "Cég" : "Magánszemély",
  email: partner.email || "",
  phone: partner.phone || "",
  website: partner.website || "",
  taxNumber: partner.taxNumber || "",
  address: partner.address || "",
  contact: partner.contacts?.[0]
    ? `${partner.contacts[0].firstName} ${partner.contacts[0].lastName}`
    : "",
  note: partner.note || "",
});

const buildExcel = async (partners) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Saját CRM";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Partnerek", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = columns;
  partners.map(partnerRow).forEach((row) => sheet.addRow(row));
  sheet.autoFilter = { from: "A1", to: "I1" };
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

const buildCsv = (partners) => {
  const rows = [
    columns.map(({ header }) => csvValue(header)).join(";"),
    ...partners.map((partner) => {
      const row = partnerRow(partner);
      return columns.map(({ key }) => csvValue(row[key])).join(";");
    }),
  ];
  return Buffer.from(`\uFEFF${rows.join("\r\n")}`, "utf8");
};

const pdfText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const buildPdf = (partners, organizationName) => new Promise((resolve, reject) => {
  const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 32 });
  const chunks = [];
  const widths = [98, 54, 108, 78, 80, 72, 108, 82, 82];
  const startX = document.page.margins.left;
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);

  document.on("data", (chunk) => chunks.push(chunk));
  document.on("end", () => resolve(Buffer.concat(chunks)));
  document.on("error", reject);

  document.font("Helvetica-Bold").fontSize(17).fillColor("#253338").text("Partnerlista");
  document.font("Helvetica").fontSize(8).fillColor("#71807c")
    .text(`${organizationName} • Exportálva: ${new Intl.DateTimeFormat("hu-HU").format(new Date())}`, { lineGap: 2 });
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
  partners.map(partnerRow).forEach((row, rowIndex) => {
    const values = columns.map(({ key }) => pdfText(row[key]));
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

  if (partners.length === 0) {
    document.font("Helvetica").fontSize(9).fillColor("#71807c").text("Nincs exportálható partner.", startX, document.y + 14);
  }

  document.end();
});

export const buildPartnerExport = async ({ format, partners, organizationName }) => {
  if (format === "xlsx") return buildExcel(partners);
  if (format === "csv") return buildCsv(partners);
  if (format === "pdf") return buildPdf(partners, organizationName);
  throw new Error("Nem támogatott export formátum.");
};

export const exportContentTypes = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
};
