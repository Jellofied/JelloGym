package ch.duartesantos.jellogym;

/**
 * The dot grid the Water widget draws (DotBitmap.java turns it into a bitmap for RemoteViews).
 * Nothing's dot-matrix look: a few lit circles instead of type or a glass card. Pure functions so
 * the shapes are tested on the JVM (DotPatternTest.java); no Android in here.
 */
final class DotPattern {
    static final int DIGIT_W = 3;
    static final int DIGIT_H = 5;
    static final int GAP = 1;
    static final int RING = 13;

    // 3x5 numerals, the smallest grid that still reads as a number at a widget's size.
    private static final String[] DIGITS = {
        "111101101101111", // 0
        "010110010010111", // 1
        "111001111100111", // 2
        "111001111001111", // 3
        "101101111001001", // 4
        "111100111001111", // 5
        "111100111101111", // 6
        "111001010010010", // 7
        "111101111101111", // 8
        "111101111001111", // 9
    };

    private DotPattern() {}

    /** The digits of a total as one grid, one blank column between them; non-digits are dropped. */
    static boolean[][] digits(String text) {
        String s = text == null ? "" : text.replaceAll("[^0-9]", "");
        if (s.length() > 5) s = s.substring(s.length() - 5);
        if (s.isEmpty()) return new boolean[0][0];
        boolean[][] out = new boolean[DIGIT_H][s.length() * DIGIT_W + (s.length() - 1) * GAP];
        for (int i = 0; i < s.length(); i++) {
            String glyph = DIGITS[s.charAt(i) - '0'];
            int x = i * (DIGIT_W + GAP);
            for (int y = 0; y < DIGIT_H; y++) {
                for (int xx = 0; xx < DIGIT_W; xx++) out[y][x + xx] = glyph.charAt(y * DIGIT_W + xx) == '1';
            }
        }
        return out;
    }

    /** The whole ring, dim behind the progress: a dot circle on a 13x13 grid. */
    static boolean[][] ring() { return circle(1, 1); }

    /** The lit part of the ring, clockwise from the top, for a progress fraction 0..1. */
    static boolean[][] arc(float pct) {
        return circle(Math.max(0f, Math.min(1f, pct)), pct > 0 ? 1 : 0);
    }

    private static boolean[][] circle(float pct, float lit) {
        boolean[][] out = new boolean[RING][RING];
        double mid = (RING - 1) / 2.0;
        for (int y = 0; y < RING; y++) {
            for (int x = 0; x < RING; x++) {
                double dx = x - mid, dy = y - mid;
                double dist = Math.sqrt(dx * dx + dy * dy);
                if (Math.abs(dist - mid * 0.84) > 0.85) continue;
                if (lit == 0) continue;
                double angle = Math.atan2(dx, -dy);
                if (angle < 0) angle += 2 * Math.PI;
                if (angle <= pct * 2 * Math.PI) out[y][x] = true;
            }
        }
        return out;
    }
}
