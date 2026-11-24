/**
 * Self-hosted fonts (replaces the Google Fonts CDN <link> previously in index.html).
 *
 * Families/weights match what was previously loaded from fonts.googleapis.com:
 *   Playfair Display: 400, 500, 600, 700 (normal) + 400, 500 (italic)
 *   Inter: 300, 400, 500, 600
 *
 * @fontsource packages register the family names exactly as "Playfair Display"
 * and "Inter", matching tailwind.config.ts `fontFamily.display` / `fontFamily.body`,
 * so no font-family aliasing is required.
 */

// Playfair Display - normal
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";

// Playfair Display - italic
import "@fontsource/playfair-display/400-italic.css";
import "@fontsource/playfair-display/500-italic.css";

// Inter
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
