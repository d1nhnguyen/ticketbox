import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsInt,
  IsPositive,
  IsDateString,
  Min,
  IsOptional,
} from 'class-validator';

export class CreateTicketTypeDto {
  @IsUUID()
  @IsNotEmpty()
  concertId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  zoneKey?: string;

  @IsInt()
  @IsPositive()
  price: number;

  @IsInt()
  @IsPositive()
  totalQty: number;

  @IsInt()
  @Min(1)
  maxPerUser: number;

  @IsDateString()
  saleStartsAt: string;
}
