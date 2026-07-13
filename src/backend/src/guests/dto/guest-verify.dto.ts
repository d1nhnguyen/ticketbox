import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class VerifyGuestDto {
  @IsString()
  @IsNotEmpty()
  concertId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  docId?: string;
}

export class CheckInGuestDto {
  @IsUUID()
  guestId: string;
}
