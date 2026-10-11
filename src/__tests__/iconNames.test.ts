import { ICON_NAMES } from '@/components/ui/Icon';

const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json') as Record<
  string,
  number
>;

describe('Icon names', () => {
  it('every name exists in the installed Ionicons glyph map', () => {
    const missing = ICON_NAMES.filter((n) => !(n in glyphs));
    expect(missing).toEqual([]);
  });
});
