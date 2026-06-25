import { EncryptionService } from '../modules/pii/encryption.service';
import { DataClassifierService } from '../modules/pii/data-classifier.service';
import { ConfigService } from '@nestjs/config';

describe('PII EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    const config = new ConfigService({
      nodeEnv: 'test',
      pii: {
        masterKey: 'test-master-key-for-unit-tests-only-please-change',
      },
    });
    service = new EncryptionService(config);
    service.onModuleInit();
  });

  it('encrypt and decrypt round-trip', () => {
    const plain = 'Hello, PII World! 张三 123456';
    const enc = service.encrypt(plain);
    expect(enc.ciphertext).not.toBe(plain);
    expect(enc.iv).toBeTruthy();
    expect(enc.tag).toBeTruthy();
    expect(enc.keyVersion).toBe(1);

    const dec = service.decrypt(enc);
    expect(dec).toBe(plain);
  });

  it('empty string round-trip', () => {
    const enc = service.encrypt('');
    expect(enc.ciphertext).toBe('');
    const dec = service.decrypt(enc);
    expect(dec).toBe('');
  });

  it('encryptObject and decryptObject round-trip', () => {
    const obj = {
      name: '张三',
      email: 'zhangsan@example.com',
      age: 30,
      role: 'engineer',
    };
    const enc = service.encryptObject(obj, ['name', 'email']);
    expect(enc.name).toBeUndefined();
    expect(enc.email).toBeUndefined();
    expect(enc.age).toBe(30);
    expect(enc.role).toBe('engineer');
    expect(enc._encrypted.name).toBeTruthy();
    expect(enc._encrypted.email).toBeTruthy();

    const dec = service.decryptObject(enc);
    expect(dec.name).toBe('张三');
    expect(dec.email).toBe('zhangsan@example.com');
    expect(dec.age).toBe(30);
    expect(dec.role).toBe('engineer');
    expect((dec as any)._encrypted).toBeUndefined();
  });

  it('hashPseudonym is deterministic with same salt', () => {
    const h1 = service.hashPseudonym('zhangsan@example.com', 'salt123');
    const h2 = service.hashPseudonym('zhangsan@example.com', 'salt123');
    expect(h1).toBe(h2);
    expect(h1.length).toBe(32);
  });

  it('hashPseudonym produces different results with different salt', () => {
    const h1 = service.hashPseudonym('zhangsan@example.com', 'salt1');
    const h2 = service.hashPseudonym('zhangsan@example.com', 'salt2');
    expect(h1).not.toBe(h2);
  });

  it('maskEmail hides local part', () => {
    expect(service.maskEmail('zhangsan@example.com')).toBe('zh***@example.com');
    expect(service.maskEmail('a@b.com')).toBe('a***@b.com');
    expect(service.maskEmail('ab@b.com')).toBe('a***@b.com');
    expect(service.maskEmail('abc@b.com')).toBe('ab***@b.com');
    expect(service.maskEmail('notanemail')).toBe('notanemail');
  });

  it('maskName masks middle characters', () => {
    expect(service.maskName('张')).toBe('*');
    expect(service.maskName('张三')).toBe('张*');
    expect(service.maskName('张三丰')).toBe('张*丰');
    expect(service.maskName('欧阳锋')).toBe('欧*锋');
    expect(service.maskName('诸葛亮孔明')).toBe('诸***明');
  });

  it('different plaintexts produce different ciphertexts', () => {
    const e1 = service.encrypt('secret1');
    const e2 = service.encrypt('secret2');
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
  });

  it('same plaintext produces different ciphertexts each time (random IV)', () => {
    const e1 = service.encrypt('same-secret');
    const e2 = service.encrypt('same-secret');
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
    expect(e1.iv).not.toBe(e2.iv);
  });

  it('decrypt with wrong key version throws', () => {
    const enc = service.encrypt('test');
    const badEnc = { ...enc, keyVersion: 99 };
    expect(() => service.decrypt(badEnc)).toThrow('Unknown encryption key version: 99');
  });

  it('decrypt with tampered ciphertext throws (GCM integrity)', () => {
    const enc = service.encrypt('test');
    const tampered = { ...enc, ciphertext: Buffer.from('AAAA').toString('base64') };
    expect(() => service.decrypt(tampered)).toThrow();
  });
});

describe('PII DataClassifierService', () => {
  let service: DataClassifierService;

  beforeEach(() => {
    service = new DataClassifierService();
  });

  it('email is RESTRICTED and should encrypt', () => {
    expect(service.getSensitivity('email')).toBe('RESTRICTED');
    expect(service.shouldEncrypt('email')).toBe(true);
    expect(service.getRetentionDays('email')).toBe(365);
  });

  it('name is CONFIDENTIAL and should encrypt', () => {
    expect(service.getSensitivity('name')).toBe('CONFIDENTIAL');
    expect(service.shouldEncrypt('name')).toBe(true);
  });

  it('content is CONFIDENTIAL but not encrypted at rest', () => {
    expect(service.getSensitivity('content')).toBe('CONFIDENTIAL');
    expect(service.shouldEncrypt('content')).toBe(false);
  });

  it('unknown fields default to INTERNAL', () => {
    expect(service.getSensitivity('randomField')).toBe('INTERNAL');
    expect(service.shouldEncrypt('randomField')).toBe(false);
  });

  it('classifyObject finds max sensitivity', () => {
    const result = service.classifyObject({
      name: '张三',
      email: 'a@b.com',
      role: 'dev',
    });
    expect(result.sensitivity).toBe('RESTRICTED');
    expect(result.fields.length).toBe(2);
  });

  it('classifyObject with no PII fields is PUBLIC', () => {
    const result = service.classifyObject({ id: '123', count: 5 });
    expect(result.sensitivity).toBe('PUBLIC');
    expect(result.fields.length).toBe(0);
  });

  it('custom field registration', () => {
    service.registerField('passport', 'RESTRICTED', {
      encryptAtRest: true,
      retentionDays: 180,
    });
    expect(service.getSensitivity('passport')).toBe('RESTRICTED');
    expect(service.shouldEncrypt('passport')).toBe(true);
    expect(service.getRetentionDays('passport')).toBe(180);
  });
});
