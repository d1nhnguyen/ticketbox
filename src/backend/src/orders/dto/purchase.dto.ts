import { IsNotEmpty, IsUUID, IsInt, Min } from 'class-validator';

export class PurchaseDto {
  @IsUUID()
  @IsNotEmpty()
  ticketTypeId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
