import AllowedDomain from '../models/AllowedDomain.js';

export async function ensureAllowedDomains({ oneTime = false } = {}) {
  const defaults = [
    { domain: 'gmail.com', allowSubdomains: false, isActive: true, verifiedBy: 'system' },
  ];

  if (oneTime) {
    const count = await AllowedDomain.count();
    if (count > 0) return;
    await AllowedDomain.bulkCreate(defaults);
    return;
  }

  for (const d of defaults) {
    await AllowedDomain.findOrCreate({ where: { domain: d.domain }, defaults: d });
  }
}

export default { ensureAllowedDomains };

