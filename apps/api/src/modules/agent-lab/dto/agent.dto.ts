import {
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  IsIn,
} from 'class-validator';

const AGENT_KEY_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export class CreateAgentDto {
  @IsString()
  @Matches(AGENT_KEY_PATTERN, {
    message: 'key 必须以小写字母开头，仅包含小写字母、数字和连字符，长度为 2-64',
  })
  key!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsString()
  @MaxLength(80)
  type!: string;
}

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  type?: string;
}

export class CloneAgentDto {
  @IsString()
  @Matches(AGENT_KEY_PATTERN, {
    message: 'key 必须以小写字母开头，仅包含小写字母、数字和连字符，长度为 2-64',
  })
  key!: string;

  @IsString()
  @MaxLength(120)
  name!: string;
}

export class CreateAgentVersionDto {
  @IsString()
  @Matches(SEMVER_PATTERN, {
    message: 'version 必须是语义化版本，例如 1.0.0',
  })
  version!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  systemPrompt?: string;

  @IsOptional()
  @IsObject()
  modelConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  runtimeConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  toolBindings?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  knowledgeBindings?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  memoryBindings?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  changelog?: string;
}

export class RunAgentDto {
  @IsObject()
  input!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  agentVersionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  application?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalRunId?: string;
}

export class CreateEvaluationDatasetDto {
  @IsString()
  @Matches(AGENT_KEY_PATTERN, {
    message: 'key 必须以小写字母开头，仅包含小写字母、数字和连字符，长度为 2-64',
  })
  key!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @Matches(SEMVER_PATTERN, { message: 'version 必须是语义化版本，例如 1.0.0' })
  version?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateEvaluationDatasetCaseDto {
  @IsString()
  @Matches(AGENT_KEY_PATTERN, {
    message: 'key 必须以小写字母开头，仅包含小写字母、数字和连字符，长度为 2-64',
  })
  key!: string;

  @IsObject()
  input!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  expectedOutput?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateEvaluatorDto {
  @IsString()
  @Matches(AGENT_KEY_PATTERN, {
    message: 'key 必须以小写字母开头，仅包含小写字母、数字和连字符，长度为 2-64',
  })
  key!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsIn(['KEYWORD', 'JSON_SCHEMA', 'LATENCY'])
  type!: 'KEYWORD' | 'JSON_SCHEMA' | 'LATENCY';

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class RunEvaluationDto {
  @IsString()
  @MaxLength(100)
  datasetId!: string;

  @IsString()
  @MaxLength(100)
  evaluatorId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  agentVersionId?: string;
}

export class SpawnSubRunDto {
  @IsObject()
  input!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  budget?: Record<string, unknown>;
}
