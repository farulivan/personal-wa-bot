import type { AppConfig } from '../config/env.js';
import type { MessageGateway } from '../adapters/whatsapp/messageGateway.js';
import type { UserService } from '../modules/users/userService.js';

export type AppContext = {
  config: AppConfig;
  messageGateway: MessageGateway;
  userService: UserService;
  isAllowedUser: (phoneNumber: string) => boolean;
};
