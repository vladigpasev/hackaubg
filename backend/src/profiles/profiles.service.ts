import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class ProfilesService {
  constructor(private readonly usersService: UsersService) {}

  async getCurrentProfile(userId: string) {
    const user = await this.usersService.findByIdOrThrow(userId);

    return {
      userId: user.id,
      email: user.email,
      profile: user.profile
        ? {
            firstName: user.profile.firstName,
            lastName: user.profile.lastName,
            locale: user.profile.locale,
            phoneNumber: user.profile.phoneNumber,
          }
        : null,
    };
  }
}
