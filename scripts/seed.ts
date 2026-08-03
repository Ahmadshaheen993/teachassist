/**
 * Seed Script — بيانات دولة قطر الكاملة
 *
 * يزرع هذا السكربت جميع بيانات المرجعيات لمناهج دولة قطر:
 * - الدولة (قطر)
 * - المراحل (ابتدائية، إعدادية، ثانوية)
 * - الصفوف لكل مرحلة
 * - المواد للمرحلة الإعدادية
 * - الفصل الدراسي الأول 2025-2026
 * - كتاب العلوم للصف الثامن (معتمد)
 * - وحدات ودروس الكتاب (من الفهرسة الذكية)
 *
 * التشغيل: npx tsx scripts/seed.ts
 *
 * ملاحظة: السكربت آمن — يستخدم INSERT IGNORE / ON DUPLICATE KEY UPDATE
 * لتجنب تكرار البيانات عند إعادة التشغيل.
 */

import { drizzle } from "drizzle-orm/mysql2";
import {
  countries, stages, grades, subjects, terms,
  textbooks, units, lessons,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

// ==================== Data ====================

const qatarCountry = {
  code: "QA",
  nameAr: "قطر",
  currencyCode: "QAR",
  pricePerPlan: "10",
  pricePerSemester: "150",
  isActive: true,
};

const qatarStages = [
  { nameAr: "المرحلة الابتدائية", sortOrder: 1 },
  { nameAr: "المرحلة الإعدادية", sortOrder: 2 },
  { nameAr: "المرحلة الثانوية", sortOrder: 3 },
];

const qatarGrades = [
  // Elementary (stageId will be set dynamically)
  { stageName: "المرحلة الابتدائية", grades: [
    { nameAr: "الأول الابتدائي", sortOrder: 1 },
    { nameAr: "الثاني الابتدائي", sortOrder: 2 },
    { nameAr: "الثالث الابتدائي", sortOrder: 3 },
    { nameAr: "الرابع الابتدائي", sortOrder: 4 },
    { nameAr: "الخامس الابتدائي", sortOrder: 5 },
    { nameAr: "السادس الابتدائي", sortOrder: 6 },
  ]},
  // Preparatory
  { stageName: "المرحلة الإعدادية", grades: [
    { nameAr: "السابع الإعدادي", sortOrder: 7 },
    { nameAr: "الثامن الإعدادي", sortOrder: 8 },
    { nameAr: "التاسع الإعدادي", sortOrder: 9 },
  ]},
  // Secondary
  { stageName: "المرحلة الثانوية", grades: [
    { nameAr: "العاشر الثانوي", sortOrder: 10 },
    { nameAr: "الحادي عشر الثانوي", sortOrder: 11 },
    { nameAr: "الثاني عشر الثانوي", sortOrder: 12 },
  ]},
];

const qatarSubjects = [
  { nameAr: "العلوم" },
  { nameAr: "الرياضيات" },
  { nameAr: "اللغة العربية" },
  { nameAr: "اللغة الإنجليزية" },
  { nameAr: "التربية الإسلامية" },
  { nameAr: "الدراسات الاجتماعية" },
  { nameAr: "الحوسبة وتكنولوجيا المعلومات" },
  { nameAr: "المهارات الحياتية والمهنية" },
];

const qatarTerms = [
  {
    academicYear: "2025-2026",
    nameAr: "الفصل الدراسي الأول",
    startDate: "2025-08-20",
    endDate: "2025-12-18",
  },
  {
    academicYear: "2025-2026",
    nameAr: "الفصل الدراسي الثاني",
    startDate: "2026-01-07",
    endDate: "2026-06-05",
  },
];

// Science Grade 8 — indexed from the actual PDF
const scienceG08Textbook = {
  title: "العلوم للصف الثامن",
  editionYear: 2025,
  sourceNote: "Seed data — indexed from Google Drive PDF (Q-Genius library)",
  status: "approved" as const,
};

const scienceG08Units = [
  {
    title: "طبيعة المادة ومكوناتها (الذرات - الجزيئات - العناصر - المركبات)",
    sortOrder: 1,
    status: "approved" as const,
    lessons: [
      { title: "ما الذرات؟ وما العناصر؟", sortOrder: 1, pageFrom: 4, pageTo: 11, suggestedPeriods: 1, status: "approved" as const },
      { title: "كيف نمثل العناصر الكيميائية والأعداد الذرية؟", sortOrder: 2, pageFrom: 12, pageTo: 23, suggestedPeriods: 1, status: "approved" as const },
      { title: "ما المركبات؟", sortOrder: 3, pageFrom: 24, pageTo: 33, suggestedPeriods: 1, status: "approved" as const },
      { title: "هل جزيئات المادة الواحدة متماثلة أينما وجدت؟", sortOrder: 4, pageFrom: 34, pageTo: 41, suggestedPeriods: 1, status: "approved" as const },
      { title: "ما الذي تعرفه عن الذرات والجزيئات والعناصر والمركبات؟ ماذا تستطيع أن تفعل؟", sortOrder: 5, pageFrom: 42, pageTo: 50, suggestedPeriods: 1, status: "approved" as const },
    ],
  },
  {
    title: "التغيرات الكيميائية",
    sortOrder: 2,
    status: "approved" as const,
    lessons: [
      { title: "ما التفاعل الكيميائي؟", sortOrder: 1, pageFrom: 54, pageTo: 65, suggestedPeriods: 1, status: "approved" as const },
      { title: "ماذا يحدث في التفاعل الكيميائي؟", sortOrder: 2, pageFrom: 66, pageTo: 73, suggestedPeriods: 1, status: "approved" as const },
      { title: "ما أنواع التفاعلات الكيميائية؟", sortOrder: 3, pageFrom: 74, pageTo: 85, suggestedPeriods: 1, status: "approved" as const },
      { title: "كيف تعبر عن التفاعلات الكيميائية؟", sortOrder: 4, pageFrom: 86, pageTo: 97, suggestedPeriods: 1, status: "approved" as const },
      { title: "ماذا تعرف عن التغيرات الكيميائية؟ ماذا تستطيع أن تفعل؟", sortOrder: 5, pageFrom: 98, pageTo: 104, suggestedPeriods: 1, status: "approved" as const },
    ],
  },
];

// ==================== Seed Logic ====================

async function seed() {
  console.log("🌱 Starting seed for Qatar curriculum...\n");

  // 1. Country
  console.log("1. Inserting country: قطر...");
  const [existingCountry] = await db.select().from(countries).where(eq(countries.code, "QA")).limit(1);
  let countryId: number;
  if (existingCountry) {
    console.log("   Country already exists (id=" + existingCountry.id + "), updating...");
    await db.update(countries).set(qatarCountry).where(eq(countries.id, existingCountry.id));
    countryId = existingCountry.id;
  } else {
    await db.insert(countries).values(qatarCountry);
    const [newCountry] = await db.select().from(countries).where(eq(countries.code, "QA")).limit(1);
    countryId = newCountry!.id;
  }
  console.log("   ✓ Country id=" + countryId);

  // 2. Stages
  console.log("\n2. Inserting stages...");
  const stageMap: Record<string, number> = {};
  for (const stage of qatarStages) {
    const [existing] = await db.select().from(stages)
      .where(eq(stages.countryId, countryId)).limit(1);
    // Check by name
    const allStages = await db.select().from(stages).where(eq(stages.countryId, countryId));
    const found = allStages.find(s => s.nameAr === stage.nameAr);
    if (found) {
      stageMap[stage.nameAr] = found.id;
      console.log("   ✓ Stage exists: " + stage.nameAr + " (id=" + found.id + ")");
    } else {
      await db.insert(stages).values({ ...stage, countryId });
      const all = await db.select().from(stages).where(eq(stages.countryId, countryId));
      const newStage = all.find(s => s.nameAr === stage.nameAr);
      stageMap[stage.nameAr] = newStage!.id;
      console.log("   ✓ Stage inserted: " + stage.nameAr + " (id=" + newStage!.id + ")");
    }
  }

  // 3. Grades
  console.log("\n3. Inserting grades...");
  for (const stageData of qatarGrades) {
    const stageId = stageMap[stageData.stageName];
    if (!stageId) {
      console.log("   ⚠ Stage not found: " + stageData.stageName + ", skipping grades");
      continue;
    }
    for (const grade of stageData.grades) {
      const allGrades = await db.select().from(grades).where(eq(grades.stageId, stageId));
      const found = allGrades.find(g => g.nameAr === grade.nameAr);
      if (found) {
        console.log("   ✓ Grade exists: " + grade.nameAr);
      } else {
        await db.insert(grades).values({ ...grade, stageId });
        console.log("   ✓ Grade inserted: " + grade.nameAr);
      }
    }
  }

  // 4. Subjects
  console.log("\n4. Inserting subjects...");
  const subjectMap: Record<string, number> = {};
  for (const subject of qatarSubjects) {
    const allSubjects = await db.select().from(subjects).where(eq(subjects.countryId, countryId));
    const found = allSubjects.find(s => s.nameAr === subject.nameAr);
    if (found) {
      subjectMap[subject.nameAr] = found.id;
      console.log("   ✓ Subject exists: " + subject.nameAr + " (id=" + found.id + ")");
    } else {
      await db.insert(subjects).values({ ...subject, countryId });
      const all = await db.select().from(subjects).where(eq(subjects.countryId, countryId));
      const newSubject = all.find(s => s.nameAr === subject.nameAr);
      subjectMap[subject.nameAr] = newSubject!.id;
      console.log("   ✓ Subject inserted: " + subject.nameAr + " (id=" + newSubject!.id + ")");
    }
  }

  // 5. Terms
  console.log("\n5. Inserting terms...");
  const termMap: Record<string, number> = {};
  for (const term of qatarTerms) {
    const allTerms = await db.select().from(terms).where(eq(terms.countryId, countryId));
    const found = allTerms.find(t => t.nameAr === term.nameAr && t.academicYear === term.academicYear);
    if (found) {
      termMap[term.nameAr] = found.id;
      console.log("   ✓ Term exists: " + term.nameAr + " (id=" + found.id + ")");
    } else {
      await db.insert(terms).values({ ...term, countryId });
      const all = await db.select().from(terms).where(eq(terms.countryId, countryId));
      const newTerm = all.find(t => t.nameAr === term.nameAr && t.academicYear === term.academicYear);
      termMap[term.nameAr] = newTerm!.id;
      console.log("   ✓ Term inserted: " + term.nameAr + " (id=" + newTerm!.id + ")");
    }
  }

  // 6. Textbook (Science Grade 8)
  console.log("\n6. Inserting textbook: العلوم للصف الثامن...");
  const scienceSubjectId = subjectMap["العلوم"];
  const allGradesForPrep = await db.select().from(grades)
    .where(eq(grades.stageId, stageMap["المرحلة الإعدادية"]));
  const grade8 = allGradesForPrep.find(g => g.nameAr === "الثامن الإعدادي");
  if (!scienceSubjectId || !grade8) {
    console.log("   ⚠ Missing science subject or grade 8, skipping textbook");
    console.log("   scienceSubjectId:", scienceSubjectId, "grade8:", grade8);
  } else {
    const allTextbooks = await db.select().from(textbooks)
      .where(eq(textbooks.countryId, countryId));
    const found = allTextbooks.find(t => t.title === scienceG08Textbook.title);
    let textbookId: number;
    if (found) {
      textbookId = found.id;
      console.log("   ✓ Textbook exists (id=" + textbookId + ")");
    } else {
      await db.insert(textbooks).values({
        ...scienceG08Textbook,
        countryId,
        subjectId: scienceSubjectId,
        gradeId: grade8.id,
        termId: termMap["الفصل الدراسي الأول"] || null,
      });
      const all = await db.select().from(textbooks).where(eq(textbooks.countryId, countryId));
      const newTextbook = all.find(t => t.title === scienceG08Textbook.title);
      textbookId = newTextbook!.id;
      console.log("   ✓ Textbook inserted (id=" + textbookId + ")");
    }

    // 7. Units and Lessons
    console.log("\n7. Inserting units and lessons...");
    for (const unit of scienceG08Units) {
      const allUnits = await db.select().from(units).where(eq(units.textbookId, textbookId));
      const foundUnit = allUnits.find(u => u.title === unit.title);
      let unitId: number;
      if (foundUnit) {
        unitId = foundUnit.id;
        console.log("   ✓ Unit exists: " + unit.title);
      } else {
        await db.insert(units).values({ ...unit, textbookId });
        const allU = await db.select().from(units).where(eq(units.textbookId, textbookId));
        const newUnit = allU.find(u => u.title === unit.title);
        unitId = newUnit!.id;
        console.log("   ✓ Unit inserted: " + unit.title);
      }

      for (const lesson of unit.lessons) {
        const allLessons = await db.select().from(lessons).where(eq(lessons.unitId, unitId));
        const foundLesson = allLessons.find(l => l.title === lesson.title);
        if (foundLesson) {
          console.log("     ✓ Lesson exists: " + lesson.title);
        } else {
          await db.insert(lessons).values({ ...lesson, unitId });
          console.log("     ✓ Lesson inserted: " + lesson.title);
        }
      }
    }
  }

  console.log("\n✅ Seed completed successfully!");
  console.log("\nSummary:");
  console.log("  Country: قطر (id=" + countryId + ")");
  console.log("  Stages: " + Object.keys(stageMap).length);
  console.log("  Subjects: " + Object.keys(subjectMap).length);
  console.log("  Terms: " + Object.keys(termMap).length);
  console.log("  Textbook: العلوم للصف الثامن (with 2 units, 10 lessons)");

  process.exit(0);
}

seed().catch(err => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
