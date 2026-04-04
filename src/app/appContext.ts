import type pkg from 'whatsapp-web.js';
import type { AppConfig } from '../config/env.js';
import type { MessageGateway } from '../adapters/whatsapp/messageGateway.js';
import type { WorkoutRepository } from '../modules/workouts/infra/workoutRepository.js';
import type { UserRepository } from '../modules/users/infra/userRepository.js';

export type AppClient = pkg.Client;

export type AppContext = {
  client: AppClient;
  config: AppConfig;
  messageGateway: MessageGateway;
  workoutRepository: WorkoutRepository;
  userRepository: UserRepository;
};
