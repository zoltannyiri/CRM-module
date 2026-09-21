import service, { IncomingInvoiceError } from "../services/incomingInvoiceService.js";
import {
  INCOMING_INVOICE_CURRENCIES,
  INCOMING_INVOICE_STATUSES,
  normalizeIncomingInvoicePayload,
  parseDateOnly,
  parsePositiveId,
} from "../validation/incomingInvoiceValidation.js";

const respondError = (error, res, next) => error instanceof IncomingInvoiceError
  ? res.status(error.statusCode).json({ message: error.message, ...(error.code && { code: error.code }), ...(error.permission && { permission: error.permission }) })
  : next(error);

function optionalId(value, label) {
  if (value === undefined) return { value: undefined };
  const parsed = parsePositiveId(value);
  return parsed ? { value: parsed } : { error: `A ${label} pozitív egész szám kell legyen.` };
}

export async function list(req, res, next) {
  try {
    const supplier = optionalId(req.query.supplierPartnerId, "supplierPartnerId");
    const project = optionalId(req.query.projectId, "projectId");
    if (supplier.error || project.error) return res.status(400).json({ message: supplier.error || project.error });
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    const currency = req.query.currency ? String(req.query.currency).toUpperCase() : undefined;
    if (status && !INCOMING_INVOICE_STATUSES.includes(status)) return res.status(400).json({ message: "Érvénytelen számlastátusz." });
    if (currency && !INCOMING_INVOICE_CURRENCIES.includes(currency)) return res.status(400).json({ message: "Érvénytelen pénznem." });
    const dates = {};
    for (const key of ["dueFrom", "dueTo", "issueFrom", "issueTo"]) {
      if (req.query[key] !== undefined) {
        const parsed = parseDateOnly(req.query[key]);
        if (!parsed) return res.status(400).json({ message: "Érvénytelen dátumszűrő." });
        dates[key] = parsed;
      }
    }
    const invoices = await service.getIncomingInvoices({
      organizationId: req.organization.id,
      membership: req.membership,
      filters: {
        query: String(req.query.q || ""), supplierPartnerId: supplier.value, projectId: project.value,
        status, currency, ...dates, sortBy: req.query.sortBy, sortDirection: req.query.sortDirection,
      },
    });
    return res.json(invoices);
  } catch (error) { return respondError(error, res, next); }
}

export async function show(req, res, next) {
  try {
    const invoiceId = parsePositiveId(req.params.id);
    if (!invoiceId) return res.status(400).json({ message: "Érvénytelen számlaazonosító." });
    const invoice = await service.getIncomingInvoiceById({ organizationId: req.organization.id, membership: req.membership, invoiceId });
    if (!invoice) return res.status(404).json({ message: "A bejövő számla nem található." });
    return res.json(invoice);
  } catch (error) { return respondError(error, res, next); }
}

export async function create(req, res, next) {
  try {
    const normalized = normalizeIncomingInvoicePayload(req.body);
    if (normalized.error) return res.status(400).json({ message: normalized.error });
    const invoice = await service.createIncomingInvoice({ organizationId: req.organization.id, membership: req.membership, actorMemberId: req.membership.id, data: normalized.data });
    return res.status(201).json(invoice);
  } catch (error) { return respondError(error, res, next); }
}

export async function update(req, res, next) {
  try {
    const invoiceId = parsePositiveId(req.params.id);
    if (!invoiceId) return res.status(400).json({ message: "Érvénytelen számlaazonosító." });
    const normalized = normalizeIncomingInvoicePayload(req.body, { partial: true });
    if (normalized.error) return res.status(400).json({ message: normalized.error });
    if (!Object.keys(normalized.data).length) return res.status(400).json({ message: "Nincs módosítható mező." });
    const invoice = await service.updateIncomingInvoice({ organizationId: req.organization.id, membership: req.membership, actorMemberId: req.membership.id, invoiceId, data: normalized.data });
    if (!invoice) return res.status(404).json({ message: "A bejövő számla nem található." });
    return res.json(invoice);
  } catch (error) { return respondError(error, res, next); }
}

export async function remove(req, res, next) {
  try {
    const invoiceId = parsePositiveId(req.params.id);
    if (!invoiceId) return res.status(400).json({ message: "Érvénytelen számlaazonosító." });
    const deleted = await service.deleteIncomingInvoice({ organizationId: req.organization.id, actorMemberId: req.membership.id, invoiceId });
    if (!deleted) return res.status(404).json({ message: "A bejövő számla nem található." });
    return res.json({ message: "A bejövő számla törölve." });
  } catch (error) { return respondError(error, res, next); }
}

export default { list, show, create, update, remove };
