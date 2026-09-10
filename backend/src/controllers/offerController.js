import offerService, { OfferInputError } from "../services/offerService.js";

const OFFER_STATUSES = new Set(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"]);
const EDITABLE_FIELDS = new Set(["partnerId", "projectId", "status", "issueDate", "validUntil", "currency", "note", "items"]);

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function normalizePayload(body, { partial = false } = {}) {
  const source = body || {};
  const data = {};
  const has = (key) => Object.hasOwn(source, key);

  if (!partial || has("partnerId")) {
    const partnerId = parsePositiveId(source.partnerId);
    if (!partnerId) return { error: "Partner kiválasztása kötelező." };
    data.partnerId = partnerId;
  }
  if (!partial || has("projectId")) {
    if (source.projectId === null || source.projectId === "" || source.projectId === undefined) data.projectId = null;
    else {
      const projectId = parsePositiveId(source.projectId);
      if (!projectId) return { error: "A projectId pozitív egész szám kell legyen." };
      data.projectId = projectId;
    }
  }
  if (!partial || has("status")) {
    const status = source.status || "DRAFT";
    if (!OFFER_STATUSES.has(status)) return { error: "Érvénytelen ajánlatstátusz." };
    data.status = status;
  }
  for (const field of ["issueDate", "validUntil"]) {
    if (!partial || has(field)) {
      const date = parseDate(source[field]);
      if (!date) return { error: "A dátumokat ÉÉÉÉ-HH-NN formátumban add meg." };
      data[field] = date;
    }
  }
  if (data.issueDate && data.validUntil && data.validUntil < data.issueDate) {
    return { error: "Az érvényesség vége nem lehet korábbi a kiállítás dátumánál." };
  }
  if (!partial || has("currency")) {
    const currency = typeof source.currency === "string" ? source.currency.trim().toUpperCase() : "";
    if (!/^[A-Z]{3}$/.test(currency)) return { error: "A pénznem hárombetűs ISO kód legyen." };
    data.currency = currency;
  }
  if (!partial || has("note")) {
    data.note = typeof source.note === "string" && source.note.trim() ? source.note.trim() : null;
  }
  if (!partial || has("items")) data.items = source.items;
  return { data };
}

async function getOffers(req, res, next) {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    if (status && !OFFER_STATUSES.has(status)) return res.status(400).json({ message: "Érvénytelen ajánlatstátusz." });
    const partnerId = req.query.partnerId === undefined ? undefined : parsePositiveId(req.query.partnerId);
    if (req.query.partnerId !== undefined && !partnerId) return res.status(400).json({ message: "A partnerId pozitív egész szám kell legyen." });
    const projectId = req.query.projectId === undefined ? undefined : parsePositiveId(req.query.projectId);
    if (req.query.projectId !== undefined && !projectId) return res.status(400).json({ message: "A projectId pozitív egész szám kell legyen." });
    const offers = await offerService.getOffers({
      organizationId: req.organization.id,
      membership: req.membership,
      query: String(req.query.q || ""),
      status,
      partnerId,
      projectId,
      sortDirection: req.query.sortDirection === "asc" ? "asc" : "desc",
    });
    return res.json(offers);
  } catch (error) { return next(error); }
}

async function getOfferById(req, res, next) {
  try {
    const offerId = parsePositiveId(req.params.id);
    if (!offerId) return res.status(400).json({ message: "Érvénytelen ajánlatazonosító." });
    const offer = await offerService.getOfferById({ organizationId: req.organization.id, membership: req.membership, offerId });
    if (!offer) return res.status(404).json({ message: "Ajánlat nem található." });
    return res.json(offer);
  } catch (error) { return next(error); }
}

async function createOffer(req, res, next) {
  try {
    const normalized = normalizePayload(req.body);
    if (normalized.error) return res.status(400).json({ message: normalized.error });
    const offer = await offerService.createOffer({ organizationId: req.organization.id, membership: req.membership, actorMemberId: req.membership?.id, data: normalized.data });
    return res.status(201).json(offer);
  } catch (error) {
    if (error instanceof OfferInputError) return res.status(error.statusCode).json({ message: error.message, ...(error.code && { code: error.code }), ...(error.permission && { permission: error.permission }) });
    return next(error);
  }
}

async function updateOffer(req, res, next) {
  try {
    const offerId = parsePositiveId(req.params.id);
    if (!offerId) return res.status(400).json({ message: "Érvénytelen ajánlatazonosító." });
    const allowedBody = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => EDITABLE_FIELDS.has(key)));
    const normalized = normalizePayload(allowedBody, { partial: true });
    if (normalized.error) return res.status(400).json({ message: normalized.error });
    const offer = await offerService.updateOffer({ organizationId: req.organization.id, membership: req.membership, actorMemberId: req.membership?.id, offerId, data: normalized.data });
    if (!offer) return res.status(404).json({ message: "Ajánlat nem található." });
    return res.json(offer);
  } catch (error) {
    if (error instanceof OfferInputError) return res.status(error.statusCode).json({ message: error.message, ...(error.code && { code: error.code }), ...(error.permission && { permission: error.permission }) });
    return next(error);
  }
}

async function deleteOffer(req, res, next) {
  try {
    const offerId = parsePositiveId(req.params.id);
    if (!offerId) return res.status(400).json({ message: "Érvénytelen ajánlatazonosító." });
    const deleted = await offerService.deleteOffer({ organizationId: req.organization.id, actorMemberId: req.membership?.id, offerId });
    if (!deleted) return res.status(404).json({ message: "Ajánlat nem található." });
    return res.json({ message: "Ajánlat törölve." });
  } catch (error) { return next(error); }
}

export default { getOffers, getOfferById, createOffer, updateOffer, deleteOffer };
