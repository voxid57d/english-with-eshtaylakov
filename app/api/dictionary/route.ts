// app/api/dictionary/route.ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
   const { searchParams } = new URL(request.url);
   const word = searchParams.get("word");

   if (!word) {
      return NextResponse.json(
         { error: "Missing 'word' query parameter" },
         { status: 400 }
      );
   }

   try {
      const apiRes = await fetch(
         `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
            word
         )}`
      );

      if (!apiRes.ok) {
         return NextResponse.json(
            { error: "No definition found for this word" },
            { status: 404 }
         );
      }

      const data = await apiRes.json();

      // We will return only the most useful parts in a simpler shape
      const first = data[0];

      const result = {
         word: first.word,
         phonetic: first.phonetic ?? null,
         meanings:
            first.meanings?.map((m: any) => ({
               partOfSpeech: m.partOfSpeech,
               definitions: m.definitions?.map((d: any) => ({
                  definition: d.definition,
                  example: d.example ?? null,
               })),
            })) ?? [],
      };

      return NextResponse.json(result);
   } catch (err) {
      console.error("Dictionary API error:", err);
      return NextResponse.json(
         { error: "Failed to fetch definition" },
         { status: 500 }
      );
   }
}
