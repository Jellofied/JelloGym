package ch.duartesantos.jellogym;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;

/** Draws a DotPattern grid as round dots (WaterWidgetProvider.java). One circle per lit cell. */
final class DotBitmap {
    private DotBitmap() {}

    /** `stepDp` is the space one dot takes, including the gap around it. */
    static Bitmap draw(Context context, boolean[][] dots, int color, float stepDp) {
        float step = stepDp * context.getResources().getDisplayMetrics().density;
        int cols = dots.length == 0 ? 0 : dots[0].length;
        int w = Math.max(1, Math.round(cols * step));
        int h = Math.max(1, Math.round(dots.length * step));
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(color);
        paint.setStyle(Paint.Style.FILL);
        float r = step * 0.34f;
        for (int y = 0; y < dots.length; y++) {
            for (int x = 0; x < cols; x++) {
                if (dots[y][x]) canvas.drawCircle(x * step + step / 2, y * step + step / 2, r, paint);
            }
        }
        return bmp;
    }
}
