import { featureRegistry } from './registry.js';
import { WorkoutFeature } from './workout/handler.js';

export function initFeatures(): void {
  console.log('🔧 Initializing features...');
  
  // Register workout feature
  featureRegistry.register('workout', new WorkoutFeature());

  // Future features can be registered here:
  // featureRegistry.register('notes', new NotesFeature());
  // featureRegistry.register('todo', new TodoFeature());
  // featureRegistry.register('reminder', new ReminderFeature());

  console.log('✅ Features initialized');
}
