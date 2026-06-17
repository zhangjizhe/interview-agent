import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type QuestionDocument = Question & Document;

@Schema({ collection: 'questions', timestamps: true })
export class Question {
  @Prop({ required: true })
  question: string;

  @Prop({ required: true })
  category: string;

  @Prop({ required: true, enum: ['easy', 'medium', 'hard'] })
  difficulty: string;

  @Prop()
  options?: string[];

  @Prop()
  answer?: string;

  @Prop()
  analysis?: string;

  @Prop({ default: 0 })
  usageCount: number;

  @Prop({ default: true })
  active: boolean;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);
