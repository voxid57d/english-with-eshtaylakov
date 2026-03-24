export const READING_LEVEL_LABELS: Record<string, string> = {
   A1: "Beginner",
   A2: "Elementary",
   B1: "Pre-Inter",
   B2: "Intermediate",
   C1: "IELTS",
};

export type ReadingTextTone = "body" | "large" | "small";
export type ReadingTextAlign = "left" | "center";

export type ReadingParagraphBlock = {
   id: string;
   type: "paragraph";
   text: string;
   tone?: ReadingTextTone;
   bold?: boolean;
   italic?: boolean;
   align?: ReadingTextAlign;
};

export type ReadingHeadingBlock = {
   id: string;
   type: "heading";
   text: string;
   level?: "h2" | "h3";
   align?: ReadingTextAlign;
};

export type ReadingImageBlock = {
   id: string;
   type: "image";
   url: string;
   caption?: string;
   width?: "full" | "narrow";
};

export type ReadingContentBlock =
   | ReadingParagraphBlock
   | ReadingHeadingBlock
   | ReadingImageBlock;

function isReadingTextTone(value: unknown): value is ReadingTextTone {
   return value === "body" || value === "large" || value === "small";
}

function isReadingTextAlign(value: unknown): value is ReadingTextAlign {
   return value === "left" || value === "center";
}

function normalizeParagraphBlock(
   rawBlock: Record<string, unknown>
): ReadingParagraphBlock | null {
   const text = typeof rawBlock.text === "string" ? rawBlock.text.trim() : "";
   if (!text) return null;

   return {
      id:
         typeof rawBlock.id === "string" && rawBlock.id.trim()
            ? rawBlock.id
            : crypto.randomUUID(),
      type: "paragraph",
      text,
      tone: isReadingTextTone(rawBlock.tone) ? rawBlock.tone : "body",
      bold: rawBlock.bold === true,
      italic: rawBlock.italic === true,
      align: isReadingTextAlign(rawBlock.align) ? rawBlock.align : "left",
   };
}

function normalizeHeadingBlock(
   rawBlock: Record<string, unknown>
): ReadingHeadingBlock | null {
   const text = typeof rawBlock.text === "string" ? rawBlock.text.trim() : "";
   if (!text) return null;

   return {
      id:
         typeof rawBlock.id === "string" && rawBlock.id.trim()
            ? rawBlock.id
            : crypto.randomUUID(),
      type: "heading",
      text,
      level: rawBlock.level === "h3" ? "h3" : "h2",
      align: isReadingTextAlign(rawBlock.align) ? rawBlock.align : "left",
   };
}

function normalizeImageBlock(
   rawBlock: Record<string, unknown>
): ReadingImageBlock | null {
   const url = typeof rawBlock.url === "string" ? rawBlock.url.trim() : "";
   if (!url) return null;

   return {
      id:
         typeof rawBlock.id === "string" && rawBlock.id.trim()
            ? rawBlock.id
            : crypto.randomUUID(),
      type: "image",
      url,
      caption:
         typeof rawBlock.caption === "string" && rawBlock.caption.trim()
            ? rawBlock.caption.trim()
            : undefined,
      width: rawBlock.width === "narrow" ? "narrow" : "full",
   };
}

export function normalizeReadingContentBlocks(
   rawValue: unknown,
   fallbackText?: string | null
): ReadingContentBlock[] {
   if (Array.isArray(rawValue)) {
      const normalized = rawValue
         .map((rawBlock) => {
            if (!rawBlock || typeof rawBlock !== "object") return null;
            const typedBlock = rawBlock as Record<string, unknown>;
            const type = typedBlock.type;

            if (type === "paragraph") return normalizeParagraphBlock(typedBlock);
            if (type === "heading") return normalizeHeadingBlock(typedBlock);
            if (type === "image") return normalizeImageBlock(typedBlock);

            return null;
         })
         .filter((block): block is ReadingContentBlock => block !== null);

      if (normalized.length > 0) {
         return normalized;
      }
   }

   const text = typeof fallbackText === "string" ? fallbackText.trim() : "";
   if (!text) return [];

   return text
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph, index) => ({
         id: `legacy-paragraph-${index + 1}`,
         type: "paragraph" as const,
         text: paragraph,
         tone: "body" as const,
         align: "left" as const,
      }));
}

export function serializeReadingContentBlocks(
   blocks: ReadingContentBlock[]
): ReadingContentBlock[] {
   return blocks
      .map((block) => {
         if (block.type === "paragraph") {
            const normalized = normalizeParagraphBlock(block as Record<string, unknown>);
            return normalized;
         }

         if (block.type === "heading") {
            const normalized = normalizeHeadingBlock(block as Record<string, unknown>);
            return normalized;
         }

         if (block.type === "image") {
            const normalized = normalizeImageBlock(block as Record<string, unknown>);
            return normalized;
         }

         return null;
      })
      .filter((block): block is ReadingContentBlock => block !== null);
}

export function createReadingBlock(
   type: ReadingContentBlock["type"]
): ReadingContentBlock {
   const id = crypto.randomUUID();

   if (type === "heading") {
      return {
         id,
         type,
         text: "",
         level: "h2",
         align: "left",
      };
   }

   if (type === "image") {
      return {
         id,
         type,
         url: "",
         caption: "",
         width: "full",
      };
   }

   return {
      id,
      type: "paragraph",
      text: "",
      tone: "body",
      bold: false,
      italic: false,
      align: "left",
   };
}

export function slugifyReadingTitle(value: string) {
   return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
}

export function getReadingLevelLabel(level: string | null | undefined) {
   if (!level) return null;

   const normalized = level.trim().toUpperCase();
   return READING_LEVEL_LABELS[normalized] ?? level;
}
