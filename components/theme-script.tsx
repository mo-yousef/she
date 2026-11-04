/**
 * Applies the saved theme before paint to avoid a flash. Respects the manual
 * override stored in localStorage; otherwise falls back to prefers-color-scheme
 * via the CSS in globals.css (no data-theme attribute set).
 */
export function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
