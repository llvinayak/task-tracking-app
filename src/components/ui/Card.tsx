import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export interface CardProps extends ViewProps {
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ padded = true, style, ...rest }: CardProps) {
  const t = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: t.colors.surface,
          borderColor: t.colors.line,
          borderWidth: 1,
          borderRadius: t.radius.xl,
          padding: padded ? t.spacing[4] : 0,
        },
        t.elevation('xs'),
        style,
      ]}
    />
  );
}
