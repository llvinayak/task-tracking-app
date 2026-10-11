import React from 'react';
import { View } from 'react-native';

import { RunningTimerBanner } from '@/features/timer/RunningTimerBanner';

import { OfflineBanner } from './OfflineBanner';

/** Offline + running-timer strips: rendered by PageHeader so every headed screen shows them. */
export function GlobalStrips() {
  return (
    <View>
      <OfflineBanner />
      <RunningTimerBanner />
    </View>
  );
}
