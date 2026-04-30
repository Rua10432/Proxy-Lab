import "@material/web/all.js";
import { styles as typescaleStyles } from "@material/web/typography/md-typescale-styles.js";

// Export typography styles so they can be accessed if needed, 
// though the adoption logic in index.html will be updated.
window.materialTypographyStyles = typescaleStyles;
