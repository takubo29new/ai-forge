// テーマ判定ロジックはsrc/components/theme-toggle.tsxのgetStoredTheme/applyTheme
// と実質同じ内容を持つ。ハイドレーション前の初回描画に間に合わせるため、
// モジュールをimportできないインラインscriptとして自己完結な文字列で持つ必要が
// あり、完全な一本化はできない。ロジックを変える場合は両方を修正すること。
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
