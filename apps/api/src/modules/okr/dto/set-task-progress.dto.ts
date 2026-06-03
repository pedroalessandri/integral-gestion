import { IsInt, Max, Min } from 'class-validator';

export class SetTaskProgressDto {
  @IsInt()
  @Min(0)
  @Max(10000)
  progressBp!: number;
}
