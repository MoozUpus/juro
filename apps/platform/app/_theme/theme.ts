export type ThemeMode = "system" | "light" | "dark";

export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var c=document.cookie.match(/(?:^|; )juro_theme=(system|light|dark)(?:;|$)/);var l=localStorage.getItem("juro-theme");var m=c?c[1]:(l==="light"||l==="dark"||l==="system"?l:"system");var d=m==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):m;document.documentElement.dataset.theme=d;document.documentElement.dataset.themeMode=m;document.documentElement.style.colorScheme=d;}catch(e){document.documentElement.dataset.theme="light";document.documentElement.dataset.themeMode="system";document.documentElement.style.colorScheme="light";}})();`;

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}
