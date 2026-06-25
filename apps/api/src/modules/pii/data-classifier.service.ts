import { Injectable } from '@nestjs/common';

export type PiiSensitivity = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

export interface PiiField {
  name: string;
  sensitivity: PiiSensitivity;
  retentionDays?: number;
  encryptAtRest: boolean;
}

@Injectable()
export class DataClassifierService {
  private readonly fieldRegistry: Map<string, PiiField> = new Map();

  constructor() {
    this.registerField('email', 'RESTRICTED', { encryptAtRest: true, retentionDays: 365 });
    this.registerField('name', 'CONFIDENTIAL', { encryptAtRest: true, retentionDays: 365 });
    this.registerField('phone', 'RESTRICTED', { encryptAtRest: true, retentionDays: 180 });
    this.registerField('rawText', 'RESTRICTED', { encryptAtRest: true, retentionDays: 30 });
    this.registerField('resumeText', 'RESTRICTED', { encryptAtRest: true, retentionDays: 30 });
    this.registerField('content', 'CONFIDENTIAL', { encryptAtRest: false, retentionDays: 90 });
    this.registerField('answer', 'CONFIDENTIAL', { encryptAtRest: false, retentionDays: 90 });
    this.registerField('question', 'INTERNAL', { encryptAtRest: false, retentionDays: 90 });
    this.registerField('finalResponse', 'CONFIDENTIAL', { encryptAtRest: false, retentionDays: 90 });
    this.registerField('summary', 'INTERNAL', { encryptAtRest: false, retentionDays: 180 });
    this.registerField('skills', 'INTERNAL', { encryptAtRest: false, retentionDays: 180 });
    this.registerField('education', 'CONFIDENTIAL', { encryptAtRest: false, retentionDays: 180 });
    this.registerField('experience', 'CONFIDENTIAL', { encryptAtRest: false, retentionDays: 180 });
    this.registerField('projects', 'CONFIDENTIAL', { encryptAtRest: false, retentionDays: 180 });
    this.registerField('avatarUrl', 'INTERNAL', { encryptAtRest: false, retentionDays: 365 });
  }

  registerField(
    name: string,
    sensitivity: PiiSensitivity,
    options: { encryptAtRest?: boolean; retentionDays?: number } = {},
  ) {
    this.fieldRegistry.set(name, {
      name,
      sensitivity,
      encryptAtRest: options.encryptAtRest ?? false,
      retentionDays: options.retentionDays,
    });
  }

  getField(name: string): PiiField | undefined {
    return this.fieldRegistry.get(name);
  }

  getSensitivity(name: string): PiiSensitivity {
    return this.fieldRegistry.get(name)?.sensitivity || 'INTERNAL';
  }

  shouldEncrypt(name: string): boolean {
    return this.fieldRegistry.get(name)?.encryptAtRest ?? false;
  }

  getRetentionDays(name: string): number | undefined {
    return this.fieldRegistry.get(name)?.retentionDays;
  }

  classifyObject<T extends Record<string, any>>(
    obj: T,
  ): { sensitivity: PiiSensitivity; fields: PiiField[] } {
    const fields: PiiField[] = [];
    let maxSensitivity: PiiSensitivity = 'PUBLIC';

    const order: PiiSensitivity[] = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];

    for (const key of Object.keys(obj)) {
      const field = this.fieldRegistry.get(key);
      if (field) {
        fields.push(field);
        if (order.indexOf(field.sensitivity) > order.indexOf(maxSensitivity)) {
          maxSensitivity = field.sensitivity;
        }
      }
    }

    return { sensitivity: maxSensitivity, fields };
  }
}
