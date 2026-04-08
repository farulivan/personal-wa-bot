import type { UserRepository, UpsertUserData } from './infra/userRepository.js';
import { debug } from '../../logger.js';

export type CaptureContactData = {
  phoneNumber?: string;
  contactName?: string;
  pushname?: string;
};

export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async captureIfNew(userId: string, contactData: CaptureContactData): Promise<boolean> {
    const existing = await this.userRepository.findById(userId);
    if (existing) {
      return false;
    }

    const data: UpsertUserData = {
      id: userId,
      phoneNumber: contactData.phoneNumber,
      contactName: contactData.contactName,
      pushname: contactData.pushname,
    };

    await this.userRepository.upsert(data);
    debug(`👤 Captured new user: ${userId}`);
    return true;
  }

  async getDisplayName(userId: string): Promise<string> {
    return this.userRepository.getDisplayName(userId);
  }
}
