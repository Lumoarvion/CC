
import { DataTypes, Op } from "sequelize";
import { sequelize } from "../db.js";
import { extractBrand } from "../utils/domain.js";

const AccountOtp = sequelize.define(
  "AccountOtp",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      set(val) {
        const v = String(val || "").trim().toLowerCase();
        this.setDataValue("email", v);
        // auto-populate registrable brand domain (e.g., "tcs" from x@a.tcs.co.in)
        const brand = extractBrand(v);
        if (brand) this.setDataValue("domain", brand);
      },
      validate: { isEmail: true },
    },

    // registrable brand (derived from email host)
    domain: { type: DataTypes.STRING(255), allowNull: false },

    // why this OTP exists
    purpose: {
      type: DataTypes.ENUM("register", "login", "reset"),
      allowNull: false,
      defaultValue: "register",
    },

    // EXACT 4-digit numeric code (stored plaintext per your spec)
    otp: {
      type: DataTypes.STRING(4),
      allowNull: false,
      validate: { isNumeric: true, len: [4, 4] },
    },

    // set by route (now + 5 min by default; configurable)
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: "expires_at" },

    consumed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // when OTP was successfully verified (optional auditing; keep boolean for compatibility)
    otpConsumedAt: { type: DataTypes.DATE, allowNull: true, field: "otp_consumed_at" },
    attempts: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },

    createdIp: { type: DataTypes.STRING(64), allowNull: true, field: "created_ip" },
    createdUa: { type: DataTypes.STRING(512), allowNull: true, field: "created_ua" },

    // ----- Registration ticket (issued after OTP verify) -----
    // Decimal string of SHA-256(ticket) interpreted as unsigned big int
    ticketHashDecimal: {
      type: DataTypes.STRING(80),
      allowNull: true,
      unique: true,
      field: "ticket_hash_decimal",
      validate: { is: /^\d+$/ },
    },
    ticketExpiresAt: { type: DataTypes.DATE, allowNull: true, field: "ticket_expires_at" },
    ticketConsumedAt: { type: DataTypes.DATE, allowNull: true, field: "ticket_consumed_at" },
  },
  {
    tableName: "account_otps",
    underscored: true,
    timestamps: true, // created_at, updated_at

    scopes: {
      // not used & not expired
      active: {
        where: {
          consumed: false,
          expiresAt: { [Op.gt]: new Date() },
        },
      },
      // latest OTP for an email/purpose
      latestForEmailPurpose(email, purpose = "register") {
        return {
          where: { email: String(email).trim().toLowerCase(), purpose },
          order: [["createdAt", "DESC"]],
          limit: 1,
        };
      },
    },
    indexes: [
      // Speeds up hourly caps and latest lookups
      { name: 'idx_account_otps_email_purpose_created_at', fields: ['email', 'purpose', 'created_at'] },
      { name: 'idx_account_otps_created_ip_purpose_created_at', fields: ['created_ip', 'purpose', 'created_at'] },
      { name: 'idx_account_otps_created_at', fields: ['created_at'] },
    ],
  }
);

// Convenience property: otp.isExpired
Object.defineProperty(AccountOtp.prototype, "isExpired", {
  get() {
    return new Date(this.expiresAt).getTime() <= Date.now();
  },
});

export default AccountOtp;
