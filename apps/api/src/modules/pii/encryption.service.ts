import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'crypto';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: number;
}

export interface DataClassification {
  level: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  fields: string[];
}

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private keys: Map<number, Buffer> = new Map();
  private activeKeyVersion = 1;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 12;
  private readonly SALT_LENGTH = 16;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const masterKey = this.config.get<string>('pii.masterKey');
    if (!masterKey) {
      if (this.config.get<string>('nodeEnv') === 'production') {
        throw new Error(
          'PII_MASTER_KEY must be set in production — 商用环境必须配置 PII 主密钥',
        );
      }
      this.logger.warn(
        '⚠️  PII_MASTER_KEY not set — using dev key. DO NOT use in production.',
      );
    }
    this.deriveKeys(masterKey || 'INSECURE-DEV-PII-KEY-DO-NOT-USE-IN-PRODUCTION');
    this.logger.log(`✅ PII encryption ready (key version=${this.activeKeyVersion})`);
  }

  private deriveKeys(masterKey: string) {
    const keyV1 = this.deriveKey(masterKey, 'pii-encryption-v1');
    this.keys.set(1, keyV1);
    this.activeKeyVersion = 1;
  }

  private deriveKey(masterKey: string, context: string): Buffer {
    const salt = Buffer.from(context, 'utf8');
    return scryptSync(masterKey, salt, 32);
  }

  encrypt(plaintext: string): EncryptedPayload {
    if (!plaintext) return { ciphertext: '', iv: '', tag: '', keyVersion: this.activeKeyVersion };

    const key = this.keys.get(this.activeKeyVersion)!;
    const iv = randomBytes(this.IV_LENGTH);
    const cipher = createCipheriv(this.ALGORITHM, key, iv);

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      keyVersion: this.activeKeyVersion,
    };
  }

  decrypt(payload: EncryptedPayload): string {
    if (!payload.ciphertext) return '';

    const key = this.keys.get(payload.keyVersion);
    if (!key) {
      throw new Error(`Unknown encryption key version: ${payload.keyVersion}`);
    }

    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');

    const decipher = createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }

  encryptObject<T extends Record<string, any>>(
    obj: T,
    encryptedFields: Array<keyof T>,
  ): T & { _encrypted: Record<string, EncryptedPayload> } {
    const _encrypted: Record<string, EncryptedPayload> = {};
    const result: any = { ...obj };

    for (const field of encryptedFields) {
      const value = obj[field];
      if (value !== undefined && value !== null) {
        _encrypted[field as string] = this.encrypt(String(value));
        delete result[field];
      }
    }

    result._encrypted = _encrypted;
    return result;
  }

  decryptObject<T extends Record<string, any>>(
    obj: T & { _encrypted?: Record<string, EncryptedPayload> },
  ): T {
    if (!obj._encrypted) return { ...obj } as T;

    const result: any = { ...obj };
    delete result._encrypted;

    for (const [field, payload] of Object.entries(obj._encrypted)) {
      result[field] = this.decrypt(payload);
    }

    return result;
  }

  hashPseudonym(value: string, salt?: string): string {
    const h = createHash('sha256');
    if (salt) h.update(salt);
    h.update(value);
    return h.digest('hex').slice(0, 32);
  }

  maskEmail(email: string): string {
    if (!email || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
  }

  maskName(name: string): string {
    if (!name) return name;
    if (name.length <= 1) return '*';
    if (name.length === 2) return `${name[0]}*`;
    return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}`;
  }
}
