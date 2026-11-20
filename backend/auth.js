import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "node:crypto";

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
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}