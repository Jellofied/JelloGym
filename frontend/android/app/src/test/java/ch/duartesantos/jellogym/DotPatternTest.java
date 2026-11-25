package ch.duartesantos.jellogym;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The dots the Water widget draws: dot numerals and the progress ring (DotPattern.java). */
public class DotPatternTest {
    @Test
    public void digitsAreFiveRowsWithABlankColumnBetween() {
        boolean[][] three = DotPattern.digits("250");
        assertEquals(5, three.length);
        assertEquals(11, three[0].length); // 3 numerals of 3 columns, 2 gaps
        assertTrue(three[0][0]); // the top row of "2"
        assertFalse(three[1][0]);
        assertTrue(three[2][1]); // the middle bar of "2"
        // "1" is a narrow stroke, "0" is hollow
        boolean[][] one = DotPattern.digits("1");
        assertEquals(3, one[0].length);
        assertTrue(one[0][1]);
        assertFalse(one[0][0]);
        assertFalse(DotPattern.digits("0")[2][1]);
    }

    @Test
    public void nonDigitsAreDroppedAndLongTotalsKeepTheLastFive() {
        assertTrue(same(DotPattern.digits("12"), DotPattern.digits("1x2")));
        assertEquals(19, DotPattern.digits("123456")[0].length); // the last five numerals
    }

    @Test
    public void ringIsAWholeCircleAndArcIsTheLitPartOfIt() {
        boolean[][] ring = DotPattern.ring();
        assertEquals(DotPattern.RING, ring.length);
        assertEquals(DotPattern.RING, ring[0].length);
        int lit = 0;
        for (boolean[] row : ring) for (boolean b : row) if (b) lit++;
        assertTrue(lit > 20);
        boolean[][] none = DotPattern.arc(0);
        for (boolean[] row : none) for (boolean b : row) assertFalse(b);
        boolean[][] quarter = DotPattern.arc(0.25f);
        int quarterLit = 0;
        for (boolean[] row : quarter) for (boolean b : row) if (b) quarterLit++;
        assertTrue(quarterLit > 0);
        assertTrue(quarterLit < lit);
        assertTrue(same(DotPattern.arc(1), DotPattern.arc(2)));
        assertTrue(same(ring, DotPattern.arc(1)));
    }

    private static boolean same(boolean[][] a, boolean[][] b) {
        if (a.length != b.length) return false;
        for (int y = 0; y < a.length; y++) {
            if (a[y].length != b[y].length) return false;
            for (int x = 0; x < a[y].length; x++) if (a[y][x] != b[y][x]) return false;
        }
        return true;
    }
}
