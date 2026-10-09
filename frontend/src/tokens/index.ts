import { colors, type ColorScale } from "./colors";
import { spacing, type SpacingScale } from "./spacing";
import { typography, type TypographyToken } from "./typography";
import { shadows, type ShadowToken } from "./shadows";

export { colors, spacing, typography, shadows };
export type { ColorScale, SpacingScale, TypographyToken, ShadowToken };

export const tokens = {
  colors,
  spacing,
  typography,
  shadows,
} as const;

export default tokens;
