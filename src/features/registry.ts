import type { Feature } from './base.js';
import type { MessageContext, CommandResult } from '../types/types.js';
import { isFeatureEnabled, type FeatureName } from '../config/features.config.js';

// Feature registry - manages all registered features
class FeatureRegistry {
  private features: Map<FeatureName, Feature> = new Map();

  // Register a feature with its feature flag name
  register(featureName: FeatureName, feature: Feature): void {
    if (isFeatureEnabled(featureName)) {
      this.features.set(featureName, feature);
      console.log(`✅ Feature registered: ${feature.name}`);
    } else {
      console.log(`⏸️ Feature disabled: ${feature.name}`);
    }
  }

  // Find a feature that can handle the given command
  findHandler(command: string): Feature | undefined {
    for (const feature of this.features.values()) {
      if (feature.canHandle(command)) {
        return feature;
      }
    }
    return undefined;
  }

  // Handle a command using registered features
  async handle(ctx: MessageContext): Promise<CommandResult> {
    // Extract command from text (remove # prefix)
    const command = ctx.text.slice(1).split('\n')[0].trim();

    const feature = this.findHandler(command);
    if (feature) {
      console.log(`🔧 Routing to feature: ${feature.name}`);
      return feature.handle(ctx);
    }

    return { handled: false };
  }

  // Get all registered features
  getAll(): Feature[] {
    return Array.from(this.features.values());
  }

  // Get combined help text from all features
  getHelp(): string {
    const helpTexts = this.getAll().map((f) => f.getHelp());
    return helpTexts.join('\n');
  }
}

// Singleton instance
export const featureRegistry = new FeatureRegistry();
