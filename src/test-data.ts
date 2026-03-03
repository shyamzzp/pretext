// Shared test data for both the browser accuracy page (pages/accuracy.ts) and
// headless tests (layout.test.ts). Covers Latin, Arabic, Hebrew, CJK, Korean,
// Thai, emoji, mixed-direction, and edge cases (empty, whitespace, newlines,
// long words). Parameters sweep across realistic font sizes and container widths.

export const TEXTS = [
  // Latin
  { label: 'Latin short', text: "This is exactly what I was looking for. Simple, clean, and does exactly what it says on the tin." },
  { label: 'Latin long', text: "Just tried the new update and it's so much better. The performance improvements are really noticeable, especially on older devices." },
  { label: 'Latin punctuation', text: "Performance is critical for this kind of library. If you can't measure hundreds of text blocks per frame, it's not useful for real applications." },

  // Arabic
  { label: 'Arabic', text: "هذا النص باللغة العربية لاختبار دعم الاتجاه من اليمين إلى اليسار في مكتبة تخطيط النص" },
  { label: 'Arabic short', text: "مرحبا بالعالم، هذه تجربة لقياس النص العربي وكسر الأسطر بشكل صحيح" },

  // Hebrew
  { label: 'Hebrew', text: "זהו טקסט בעברית כדי לבדוק תמיכה בכיוון מימין לשמאל בספריית פריסת הטקסט" },

  // Mixed LTR + RTL
  { label: 'Mixed en+ar', text: "The meeting is scheduled for يوم الثلاثاء at the main office. Please bring your مستندات with you." },
  { label: 'Mixed en+he', text: "The project name is פרויקט חדש and it was started last month by the research team." },

  // CJK
  { label: 'Chinese', text: "这是一段中文文本，用于测试文本布局库对中日韩字符的支持。每个字符之间都可以断行。" },
  { label: 'Chinese short', text: "性能测试显示，新的文本测量方法比传统方法快了将近一千五百倍。" },
  { label: 'Japanese', text: "これはテキストレイアウトライブラリのテストです。日本語のテキストを正しく処理できるか確認します。" },
  { label: 'Korean', text: "이것은 텍스트 레이아웃 라이브러리의 테스트입니다. 한국어 텍스트를 올바르게 처리할 수 있는지 확인합니다." },

  // Thai
  { label: 'Thai', text: "นี่คือข้อความทดสอบสำหรับไลบรารีจัดวางข้อความ ทดสอบการตัดคำภาษาไทย" },

  // Emoji
  { label: 'Emoji mixed', text: "The quick 🦊 jumped over the lazy 🐕 and then went home 🏠 to rest 😴 for the night." },
  { label: 'Emoji dense', text: "Great work! 👏👏👏 This is exactly what we needed 🎯 for the project 🚀" },

  // Mixed everything
  { label: 'Multi-script', text: "Hello مرحبا שלום 你好 こんにちは 안녕하세요 สวัสดี — a greeting in seven scripts!" },
  { label: 'Numbers+RTL', text: "The price is $42.99 (approximately ٤٢٫٩٩ ريال or ₪158.50) including tax." },

  // Edge cases
  { label: 'Empty', text: "" },
  { label: 'Single char', text: "A" },
  { label: 'Whitespace', text: "   " },
  { label: 'Newlines', text: "Hello\nWorld\nMultiple\nLines" },
  { label: 'Long word', text: "Superlongwordwithoutanyspacesthatshouldjustoverflowthelineandkeepgoing" },
  { label: 'Long mixed', text: "In the heart of القاهرة القديمة, you can find ancient mosques alongside modern cafés. The city's history spans millennia. كل شارع يحكي قصة مختلفة about the rich cultural heritage." },
] as const

export const SIZES = [12, 14, 15, 16, 18, 20, 24, 28] as const

export const WIDTHS = [150, 200, 250, 300, 350, 400, 500, 600] as const
