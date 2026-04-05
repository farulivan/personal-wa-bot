import type pkg from 'whatsapp-web.js';
import type { AppConfig } from '../config/env.js';
import type { MessageGateway } from '../adapters/whatsapp/messageGateway.js';
import type { WorkoutRepository } from '../modules/workouts/infra/workoutRepository.js';
import type { QuranRepository } from '../modules/quran/infra/quranRepository.js';
import type { SholatRepository } from '../modules/sholat/infra/sholatRepository.js';
import type { RemindRepository } from '../modules/remind/infra/remindRepository.js';
import type { UserRepository } from '../modules/users/infra/userRepository.js';
import type { MyQuranSholatClient } from '../modules/sholat/infra/myQuranSholatClient.js';

export type AppClient = pkg.Client;

export type AppContext = {
  client: AppClient;
  config: AppConfig;
  messageGateway: MessageGateway;
  workoutRepository: WorkoutRepository;
  quranRepository: QuranRepository;
  sholatRepository: SholatRepository;
  sholatClient: MyQuranSholatClient;
  remindRepository: RemindRepository;
  userRepository: UserRepository;
};
