export type FolderTheme = "ocean" | "emerald" | "sunset" | "violet";

type FolderThemeConfig = {
   logoSrc: string;
   accent: string;
   glow: string;
};

export const FOLDER_THEME_MAP: Record<FolderTheme, FolderThemeConfig> = {
   ocean: {
      logoSrc: "/foldericon1.png",
      accent: "from-cyan-400/30 via-sky-500/18 to-slate-950/10",
      glow: "bg-cyan-400/20",
   },
   emerald: {
      logoSrc: "/foldericon2.png",
      accent: "from-emerald-400/30 via-lime-500/18 to-slate-950/10",
      glow: "bg-emerald-400/20",
   },
   sunset: {
      logoSrc: "/foldericon3.png",
      accent: "from-amber-400/30 via-orange-500/18 to-slate-950/10",
      glow: "bg-orange-400/20",
   },
   violet: {
      logoSrc: "/foldericon4.png",
      accent: "from-violet-400/30 via-fuchsia-500/18 to-slate-950/10",
      glow: "bg-violet-400/20",
   },
};
