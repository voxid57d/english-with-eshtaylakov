import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   blockTypeToQuestionType,
   normalizeAnswerKey,
   normalizePassageBlocks,
   normalizeReadingMockBlockType,
   slugifyMockReadingTitle,
   splitLines,
   type ReadingMockOption,
} from "@/lib/ieltsReadingMock";

function jsonError(error: unknown, fallback: string) {
   const message = error instanceof Error ? error.message : fallback;
   const status =
      message === "Missing bearer token." || message === "Unauthorized."
         ? 401
         : message === "Forbidden."
           ? 403
           : 400;
   return NextResponse.json({ error: message || fallback }, { status });
}

function normalizePassages(value: unknown) {
   if (!Array.isArray(value)) return [];
   return value
      .map((item, index) => {
         if (!item || typeof item !== "object") return null;
         const raw = item as Record<string, unknown>;
         const title = typeof raw.title === "string" ? raw.title.trim() : "";
         if (!title) return null;
         return {
            id:
               typeof raw.id === "string" && raw.id.trim()
                  ? raw.id
                  : crypto.randomUUID(),
            passage_number:
               typeof raw.passage_number === "number"
                  ? raw.passage_number
                  : index + 1,
            label:
               typeof raw.label === "string" && raw.label.trim()
                  ? raw.label.trim()
                  : `READING PASSAGE ${index + 1}`,
            title,
            subtitle:
               typeof raw.subtitle === "string" && raw.subtitle.trim()
                  ? raw.subtitle.trim()
                  : null,
            content_blocks: normalizePassageBlocks(raw.content_blocks),
         };
      })
      .filter(
         (
            item
         ): item is {
            id: string;
            passage_number: number;
            label: string;
            title: string;
            subtitle: string | null;
            content_blocks: ReturnType<typeof normalizePassageBlocks>;
         } => item !== null
      );
}

function normalizeBlocks(value: unknown) {
   if (!Array.isArray(value)) return [];
   return value
      .map((item, index) => {
         if (!item || typeof item !== "object") return null;
         const raw = item as Record<string, unknown>;
         const passageId =
            typeof raw.passage_id === "string" ? raw.passage_id.trim() : "";
         const title = typeof raw.title === "string" ? raw.title.trim() : "";
         if (!passageId || !title) return null;
         return {
            id:
               typeof raw.id === "string" && raw.id.trim()
                  ? raw.id
                  : crypto.randomUUID(),
            passage_id: passageId,
            order_index:
               typeof raw.order_index === "number" ? raw.order_index : index + 1,
            type: normalizeReadingMockBlockType(raw.type),
            title,
            instructions: splitLines(
               typeof raw.instructionsText === "string"
                  ? raw.instructionsText
                  : Array.isArray(raw.instructions)
                    ? (raw.instructions as string[]).join("\n")
                    : ""
            ),
            shared_content:
               raw.shared_content && typeof raw.shared_content === "object"
                  ? (raw.shared_content as Record<string, unknown>)
                  : {},
            meta:
               raw.meta && typeof raw.meta === "object"
                  ? (raw.meta as Record<string, unknown>)
                  : {},
         };
      })
      .filter(
         (
            item
         ): item is {
            id: string;
            passage_id: string;
            order_index: number;
            type: ReturnType<typeof normalizeReadingMockBlockType>;
            title: string;
            instructions: string[];
            shared_content: Record<string, unknown>;
            meta: Record<string, unknown>;
         } => item !== null
      );
}

function normalizeQuestions(value: unknown) {
   if (!Array.isArray(value)) return [];
   return value
      .map((item, index) => {
         if (!item || typeof item !== "object") return null;
         const raw = item as Record<string, unknown>;
         const passageId =
            typeof raw.passage_id === "string" ? raw.passage_id.trim() : "";
         const blockId =
            typeof raw.block_id === "string" ? raw.block_id.trim() : "";
         const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
         if (!passageId || !blockId) return null;
         return {
            id:
               typeof raw.id === "string" && raw.id.trim()
                  ? raw.id
                  : crypto.randomUUID(),
            passage_id: passageId,
            block_id: blockId,
            question_number:
               typeof raw.question_number === "number"
                  ? raw.question_number
                  : index + 1,
            order_index:
               typeof raw.order_index === "number" ? raw.order_index : index + 1,
            prompt,
            answer_key: normalizeAnswerKey(raw.answer_key),
            meta:
               raw.meta && typeof raw.meta === "object"
                  ? (raw.meta as Record<string, unknown>)
                  : {},
         };
      })
      .filter(
         (
            item
         ): item is {
            id: string;
            passage_id: string;
            block_id: string;
            question_number: number;
            order_index: number;
            prompt: string;
            answer_key: ReturnType<typeof normalizeAnswerKey>;
            meta: Record<string, unknown>;
         } => item !== null
      );
}

function normalizeOptions(value: unknown): ReadingMockOption[] {
   if (!Array.isArray(value)) return [];
   return value
      .map((item, index) => {
         if (!item || typeof item !== "object") return null;
         const raw = item as Record<string, unknown>;
         const questionId =
            typeof raw.question_id === "string" ? raw.question_id.trim() : "";
         const label = typeof raw.label === "string" ? raw.label.trim() : "";
         const text = typeof raw.text === "string" ? raw.text.trim() : "";
         if (!questionId || !label || !text) return null;
         return {
            id:
               typeof raw.id === "string" && raw.id.trim()
                  ? raw.id
                  : crypto.randomUUID(),
            question_id: questionId,
            label,
            text,
            order_index:
               typeof raw.order_index === "number" ? raw.order_index : index,
         };
      })
      .filter((item): item is ReadingMockOption => item !== null);
}

async function loadStructuredTests() {
   const { data: tests, error: testsError } = await supabaseAdmin
      .from("reading_mock_tests")
      .select("id, slug, title, description, is_premium, is_published, created_at")
      .order("created_at", { ascending: false });
   if (testsError) throw new Error("Failed to load reading mock tests.");

   const testIds = (tests || []).map((test) => test.id);
   if (testIds.length === 0) return [];

   const { data: passages, error: passagesError } = await supabaseAdmin
      .from("reading_mock_passages")
      .select("id, test_id, passage_number, label, title, subtitle, content_blocks, created_at")
      .in("test_id", testIds)
      .order("passage_number", { ascending: true });
   if (passagesError) throw new Error("Failed to load reading mock passages.");

   const { data: blocks, error: blocksError } = await supabaseAdmin
      .from("reading_mock_question_blocks")
      .select("id, test_id, passage_id, order_index, type, title, instructions, shared_content, meta, created_at")
      .in("test_id", testIds)
      .order("order_index", { ascending: true });
   if (blocksError) throw new Error("Failed to load reading mock blocks.");

   const { data: questions, error: questionsError } = await supabaseAdmin
      .from("reading_mock_questions")
      .select("id, test_id, passage_id, block_id, question_number, order_index, type, prompt, answer_key, meta, created_at")
      .in("test_id", testIds)
      .order("question_number", { ascending: true });
   if (questionsError) throw new Error("Failed to load reading mock questions.");

   const questionIds = (questions || []).map((question) => question.id);
   const { data: options, error: optionsError } =
      questionIds.length === 0
         ? { data: [], error: null }
         : await supabaseAdmin
              .from("reading_mock_options")
              .select("id, question_id, label, text, order_index")
              .in("question_id", questionIds)
              .order("order_index", { ascending: true });
   if (optionsError) throw new Error("Failed to load reading mock options.");

   return (tests || []).map((test) => ({
      ...test,
      passages: (passages || []).filter((passage) => passage.test_id === test.id),
      blocks: (blocks || []).filter((block) => block.test_id === test.id),
      questions: (questions || []).filter((question) => question.test_id === test.id),
      options: (options || []).filter((option) =>
         (questions || [])
            .filter((question) => question.test_id === test.id)
            .some((question) => question.id === option.question_id)
      ),
   }));
}

export async function GET(req: Request) {
   try {
      await requireAdminUser(req);
      const tests = await loadStructuredTests();
      return NextResponse.json({ tests });
   } catch (error) {
      return jsonError(error, "Failed to load reading mock admin.");
   }
}

export async function POST(req: Request) {
   try {
      await requireAdminUser(req);
      const body = await req.json();
      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const rawSlug =
         typeof body?.slug === "string" && body.slug.trim()
            ? body.slug.trim()
            : title;
      const slug = slugifyMockReadingTitle(rawSlug);
      const description =
         typeof body?.description === "string" ? body.description.trim() : "";
      const isPremium = body?.isPremium === true;
      const isPublished = body?.isPublished !== false;
      const passages = normalizePassages(body?.passages);
      const blocks = normalizeBlocks(body?.blocks);
      const questions = normalizeQuestions(body?.questions);
      const options = normalizeOptions(body?.options);

      if (!title || !slug) throw new Error("Title and slug are required.");
      if (passages.length === 0 || blocks.length === 0 || questions.length === 0) {
         throw new Error("At least one passage, block, and question are required.");
      }

      const passageIds = new Set(passages.map((item) => item.id));
      const blockIds = new Set(blocks.map((item) => item.id));
      if (blocks.some((block) => !passageIds.has(block.passage_id))) {
         throw new Error("Every block must belong to an existing passage.");
      }
      if (
         questions.some(
            (question) =>
               !passageIds.has(question.passage_id) || !blockIds.has(question.block_id)
         )
      ) {
         throw new Error("Every question must belong to an existing block and passage.");
      }

      const blockTypeMap = new Map(blocks.map((block) => [block.id, block.type]));

      const { data: test, error: testError } = await supabaseAdmin
         .from("reading_mock_tests")
         .insert({
            title,
            slug,
            description: description || null,
            is_premium: isPremium,
            is_published: isPublished,
         })
         .select("id")
         .single();
      if (testError || !test) {
         throw new Error(testError?.message || "Failed to create reading mock test.");
      }

      const { error: passagesError } = await supabaseAdmin
         .from("reading_mock_passages")
         .insert(
            passages.map((passage) => ({
               ...passage,
               test_id: test.id,
            }))
         );
      if (passagesError) throw new Error(passagesError.message);

      const { error: blocksError } = await supabaseAdmin
         .from("reading_mock_question_blocks")
         .insert(
            blocks.map((block) => ({
               ...block,
               test_id: test.id,
            }))
         );
      if (blocksError) throw new Error(blocksError.message);

      const { error: questionsError } = await supabaseAdmin
         .from("reading_mock_questions")
         .insert(
            questions.map((question) => ({
               ...question,
               test_id: test.id,
               type: blockTypeToQuestionType(blockTypeMap.get(question.block_id) || "true_false_not_given_block"),
            }))
         );
      if (questionsError) throw new Error(questionsError.message);

      if (options.length > 0) {
         const { error: optionsError } = await supabaseAdmin
            .from("reading_mock_options")
            .insert(options);
         if (optionsError) throw new Error(optionsError.message);
      }

      const tests = await loadStructuredTests();
      return NextResponse.json(
         { test: tests.find((item) => item.id === test.id) },
         { status: 201 }
      );
   } catch (error) {
      return jsonError(error, "Failed to create reading mock test.");
   }
}
