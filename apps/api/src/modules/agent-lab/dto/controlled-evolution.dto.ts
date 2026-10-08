import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateImprovementCandidateDto {
  @IsString()
  @MaxLength(100)
  sourceEvaluationId!: string;
}

export class ComparisonScopeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  datasetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  evaluatorId?: string;
}
