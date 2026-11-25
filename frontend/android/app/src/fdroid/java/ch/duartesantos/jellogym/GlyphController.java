package ch.duartesantos.jellogym;

import android.content.Context;

/** F-Droid has no Nothing SDK and no Glyph lights: the same calls do nothing here. */
public final class GlyphController {
    private GlyphController() {}

    public static boolean supported(Context context) { return false; }
    public static void start(Context context) {}
    public static void progress(Context context, float pct) {}
    public static void stop(Context context) {}
}
