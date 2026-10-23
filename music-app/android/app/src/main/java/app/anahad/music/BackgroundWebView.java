package app.anahad.music;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;

import com.getcapacitor.CapacitorWebView;

/**
 * WebView that keeps the page "visible" while music is loaded.
 *
 * When the app is minimized or the screen turns off, Android marks the
 * WebView's window as hidden. Chromium then treats the page like a background
 * tab: it pauses video-backed players (the YouTube iframe), throttles JS
 * timers, and the web player stops advancing. While PlaybackService is running
 * (something is loaded) we report the window as still visible, so playback
 * and auto-advance carry on exactly as in the foreground.
 */
public class BackgroundWebView extends CapacitorWebView {

    public BackgroundWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        if (visibility != View.VISIBLE && PlaybackService.getInstance() != null) {
            super.onWindowVisibilityChanged(View.VISIBLE);
            return;
        }
        super.onWindowVisibilityChanged(visibility);
    }
}
