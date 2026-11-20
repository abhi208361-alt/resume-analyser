import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "node:crypto";
import { db } from "./db.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-this-secret";

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      jti: crypto.randomUUID(),
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT id, role, active FROM users WHERE id = ?").get(decoded.id);
    if (!user || !user.active) return res.status(403).json({ message: "Account is inactive" });
    if (decoded.jti) {
      const session = db.prepare("SELECT revoked_at FROM user_sessions WHERE jti = ?").get(decoded.jti);
      if (session?.revoked_at) return res.status(401).json({ message: "Session has been revoked" });
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}