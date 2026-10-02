import { IsString, MaxLength } from 'class-validator';

export class GenerateImprovementCandidateDto {
  @IsString()
  @MaxLength(100)
  sourceEvaluationId!: string;
}
