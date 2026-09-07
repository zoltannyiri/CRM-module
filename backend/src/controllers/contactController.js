import contactService from "../services/contactService.js";
import { buildContactExport, contactExportContentTypes } from "../services/contactExportService.js";

async function getContacts(req, res, next) {
  try {
    const contacts = await contactService.getContacts({
      organizationId: req.organization.id,
    });
    return res.json(contacts);
  } catch (error) {
    return next(error);
  }
}

async function exportContacts(req, res, next) {
  try {
    const format = String(req.query.format || "xlsx").toLowerCase();
    if (!Object.hasOwn(contactExportContentTypes, format)) {
      return res.status(400).json({ message: "A támogatott formátumok: xlsx, pdf, csv." });
    }
    const contacts = await contactService.getContactsForExport({
      organizationId: req.organization.id,
      query: String(req.query.q || ""),
      type: String(req.query.type || "ALL"),
      sortDirection: req.query.sort === "asc" ? "asc" : "desc",
    });
    const file = await buildContactExport({ format, contacts, organizationName: req.organization.name });
    const date = new Date().toISOString().slice(0, 10);
    res.set({
      "Content-Type": contactExportContentTypes[format],
      "Content-Disposition": `attachment; filename="kapcsolattartok-${date}.${format}"`,
      "Cache-Control": "private, no-store",
    });
    return res.send(file);
  } catch (error) {
    return next(error);
  }
}

const contactData = (body) => ({
  firstName: body.firstName.trim(),
  lastName: body.lastName.trim(),
  email: body.email || null,
  phone: body.phone || null,
  position: body.position || null,
  note: body.note || null,
});

const validContactInput = (body) => (
  typeof body.firstName === "string" && body.firstName.trim()
  && typeof body.lastName === "string" && body.lastName.trim()
  && Number.isSafeInteger(Number(body.partnerId)) && Number(body.partnerId) > 0
);

async function getContactById(req, res, next) {
  try {
    const contact = await contactService.getContactById({
      organizationId: req.organization.id,
      contactId: Number(req.params.id),
    });
    if (!contact) return res.status(404).json({ message: "Kapcsolattartó nem található." });
    return res.json(contact);
  } catch (error) {
    return next(error);
  }
}

async function createContact(req, res, next) {
  try {
    const body = req.body || {};
    if (!validContactInput(body)) {
      return res.status(400).json({ message: "A partner, a vezetéknév és a keresztnév megadása kötelező." });
    }
    const contact = await contactService.createContact({
      organizationId: req.organization.id,
      partnerId: Number(body.partnerId),
      data: contactData(body),
    });
    if (!contact) return res.status(404).json({ message: "Partner nem található." });
    return res.status(201).json(contact);
  } catch (error) {
    return next(error);
  }
}

async function updateContact(req, res, next) {
  try {
    const body = req.body || {};
    if (!validContactInput(body)) {
      return res.status(400).json({ message: "A partner, a vezetéknév és a keresztnév megadása kötelező." });
    }
    const contact = await contactService.updateContact({
      organizationId: req.organization.id,
      contactId: Number(req.params.id),
      partnerId: Number(body.partnerId),
      data: contactData(body),
    });
    if (!contact) return res.status(404).json({ message: "Kapcsolattartó vagy partner nem található." });
    return res.json(contact);
  } catch (error) {
    return next(error);
  }
}

async function deleteContact(req, res, next) {
  try {
    const deleted = await contactService.deleteContact({
      organizationId: req.organization.id,
      contactId: Number(req.params.id),
    });
    if (!deleted) return res.status(404).json({ message: "Kapcsolattartó nem található." });
    return res.json({ message: "Kapcsolattartó törölve." });
  } catch (error) {
    return next(error);
  }
}

export default { getContacts, exportContacts, getContactById, createContact, updateContact, deleteContact };
