export const CAPABILITIES = Object.freeze({
  REPORTING_READ: "reporting:read",
  OPERATIONS_READ: "operations:read",
  APPROVALS_MANAGE: "approvals:manage",
  SETTINGS_MANAGE: "settings:manage",
});

const ROLE_CAPABILITIES = Object.freeze({
  admin: Object.freeze([
    CAPABILITIES.REPORTING_READ,
    CAPABILITIES.OPERATIONS_READ,
    CAPABILITIES.APPROVALS_MANAGE,
    CAPABILITIES.SETTINGS_MANAGE,
  ]),
  reporting: Object.freeze([CAPABILITIES.REPORTING_READ]),
  operational: Object.freeze([CAPABILITIES.OPERATIONS_READ]),
});

export function capabilitiesForRole(role) {
  return [...(ROLE_CAPABILITIES[String(role || "").toLowerCase()] || [])];
}

export function authorizeCapability(capability) {
  return (request, response, next) => {
    if (request.user?.capabilities?.includes(capability)) return next();
    return response.status(403).json({ error: "Bu işlem için yetki gerekli." });
  };
}
