import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface JwtPayload {
  sub: string;
  username: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(userId: string, username: string): string {
  const payload: JwtPayload = { sub: userId, username };
  // jsonwebtoken 的 expiresIn 类型较严格，这里做一次收窄
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
  if (!decoded || typeof decoded.sub !== 'string' || typeof decoded.username !== 'string') {
    throw new Error('invalid token payload');
  }
  return decoded;
}
