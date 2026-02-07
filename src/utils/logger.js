import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const transport = new DailyRotateFile({
  dirname: "logs",                     // folder
  filename: "%DATE%.log",              // log file name: 2025-08-17.log
  datePattern: "YYYY-MM-DD",           // rotate daily
  zippedArchive: true,                 // compress old logs
  maxSize: "20m",                      // optional: rotate if >20MB
  maxFiles: "7d",                      // keep logs for 7 days
});

// Local timestamp formatter (defaults to server local time; override via LOG_TZ)
const localTimestamp = winston.format.timestamp({
  format: () => {
    try {
      const tz = process.env.LOG_TZ && String(process.env.LOG_TZ).trim();
      return new Date().toLocaleString('en-CA', {
        hour12: false,
        timeZone: tz && tz.length ? tz : undefined,
      });
    } catch {
      return new Date().toString();
    }
  },
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    localTimestamp,
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
      return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(), // always show on console
    transport,                        // rotate file
  ],
});
