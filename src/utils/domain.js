// utils/domain.js
import AllowedDomain from "../models/AllowedDomain.js";
import { Op } from "sequelize";

/**
 * India public suffixes that have two parts (so we skip both).
 * Prevents picking "co" / "ac" as brand for .co.in / .ac.in, etc.
 */
const IN_MULTIPART_SUFFIXES = new Set([
  "co.in",
  "ac.in",
  "edu.in",
  "gov.in",
  "res.in",
  "nic.in",
  "org.in",
  "net.in",
  "firm.in",
  "gen.in",
  "ind.in",
]);

/**
 * Extract the host part after '@' (if an email was passed), else return as-is.
 */
function hostOf(emailOrHost) {
  const s = String(emailOrHost || "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  return at >= 0 ? s.slice(at + 1) : s;
}

/**
 * Extract the registrable brand for India-first logic (works for .com/.edu/etc. too).
 * Examples:
 *  - alice@dept.mit.edu        -> "mit"
 *  - bob@sales.company.com     -> "company"
 *  - me@analytics.tcs.co.in    -> "tcs"
 *  - test@example.com          -> "example"
 *  - student@iit.ac.in         -> "iit"
 */
export function extractBrand(emailOrHost) {
  const host = hostOf(emailOrHost);
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return parts[0] || null;

  const lastTwo = parts.slice(-2).join(".");
  if (IN_MULTIPART_SUFFIXES.has(lastTwo)) {
    // brand is the label just before the multi-part suffix (e.g., "tcs" in tcs.co.in)
    return parts[parts.length - 3] || null;
  }

  // if ends with ".in" alone (e.g., example.in)
  if (parts[parts.length - 1] === "in") {
    return parts[parts.length - 2] || null;
  }

  // default: brand = label before final single-part TLD (e.g., "company" in company.com)
  return parts[parts.length - 2] || null;
}

/**
 * Resolve and verify brand against allowed_domains table.
 * Returns brand string if allowed; otherwise null.
 */
export async function resolveAllowedBrand(email) {
  // FQDN-based allowlist check, with optional subdomain support.
  const host = hostOf(email);
  if (!host) return null;
  const now = new Date();
  // Fetch candidates: exact domain match or any rule that allows subdomains
  const candidates = await AllowedDomain.findAll({
    where: {
      isActive: true,
      [Op.or]: [
        { domain: host },
        { allowSubdomains: true },
      ],
    },
  });
  for (const rec of candidates) {
    const domain = String(rec.domain || '').toLowerCase();
    const okExpiry = !rec.expiresAt || new Date(rec.expiresAt) > now;
    if (!okExpiry) continue;
    if (host === domain) return domain;
    if (rec.allowSubdomains && (host === domain || host.endsWith(`.${domain}`))) return domain;
  }
  return null;
}

/**
 * Throw if the extracted brand is not in allowed_domains.
 */
export async function requireAllowedBrand(email) {
  const allowed = await resolveAllowedBrand(email);
  if (!allowed) {
    const err = new Error("Email domain (brand) not allowed");
    err.code = "DOMAIN_NOT_ALLOWED";
    throw err;
  }
  return allowed;
}
export default {
  hostOf,
  extractBrand,
  resolveAllowedBrand,
  requireAllowedBrand,
};
