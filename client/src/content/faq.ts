// Questions and answers about Eqence, in English and Arabic. One source for the /faq page,
// its FAQPage structured data, the prerendered HTML that answer engines read, and llms.txt.
// Every answer states only what the product does today (see packages/core, packages/ai,
// packages/connectors); prices come from the confirmed ladder, never from this file.
import { SITE_LADDER } from '../../../packages/core/src/pricing';

export interface Faq { q: string; a: string }

const selfServe = SITE_LADDER.filter((p) => !p.contactOnly);
const enterprise = SITE_LADDER.find((p) => p.contactOnly);
const n = (v: number) => v.toLocaleString('en-US');

const planLineEn = selfServe
  .map((p) => `${p.name} is $${n(p.monthlyUsd)} a month for ${n(p.aiActionsPerMonth)} AI drafted replies and ${p.channels} connected ${p.channels === 1 ? 'source' : 'sources'}`)
  .join('; ');
const planLineAr = selfServe
  .map((p) => `${p.name} بسعر ${n(p.monthlyUsd)} دولار شهريًا ويشمل ${n(p.aiActionsPerMonth)} ردًا مقترحًا بالذكاء الاصطناعي و${p.channels} ${p.channels === 1 ? 'مصدر مربوط' : 'مصادر مربوطة'}`)
  .join('، و');

export const FAQ: Record<'en' | 'ar', Faq[]> = {
  en: [
    {
      q: 'What is Eqence?',
      a: 'Eqence is a web app for Shopify stores that collect product reviews with Judge.me. It imports your reviews, labels each one positive, neutral, negative or mixed, and drafts a reply with AI in the customer\'s language, Arabic or English. Nothing is posted until you approve it.',
    },
    {
      q: 'Does Eqence work with my Shopify store?',
      a: 'Eqence works with Shopify stores that use Judge.me for product reviews. It connects to your Judge.me account, not to your Shopify admin, so it never changes your products, orders or theme.',
    },
    {
      q: 'How do I connect my store?',
      a: 'Create an account, open Connections, and enter your shop domain and your Judge.me private API token. Eqence imports your existing reviews, then Judge.me tells Eqence about new and edited reviews as they happen. Eqence also checks each connected store again every six hours in case a notification was missed.',
    },
    {
      q: 'Does Eqence post replies automatically?',
      a: 'No. Every AI draft waits for you. You can edit it, approve it or reject it. Only an approved reply is posted, as your store\'s public reply on Judge.me, and Judge.me emails it to the reviewer. A rejected draft is never posted.',
    },
    {
      q: 'Which languages does Eqence support?',
      a: 'Eqence reads reviews in Arabic and English and drafts each reply in the language the customer wrote in. Arabic replies are written to read naturally to customers in the Gulf, and you can add notes on dialect in your brand voice settings.',
    },
    {
      q: 'How does Eqence decide which language to reply in?',
      a: 'It uses the language of the customer\'s own words. The customer\'s name, city or the product never decide the language of the reply.',
    },
    {
      q: 'Will an AI draft make promises on my behalf?',
      a: 'Drafts are written not to invent refunds, discounts, delivery dates, policies or changes to how your store works, not to use emoji, and not to repeat personal details such as emails, phone numbers or order numbers. For a problem, a draft apologizes and invites the customer to contact the store privately. You still read and approve every reply before it is posted.',
    },
    {
      q: 'Can replies follow my brand voice?',
      a: 'Yes. In Brand voice you set your tone, phrases to avoid and a signature. Every new draft follows them, and a draft that uses a phrase you banned is refused.',
    },
    {
      q: 'How are negative reviews flagged?',
      a: 'Eqence scores each new review from minus 1 (very negative) to plus 1 (very positive). When a review scores minus 0.4 or lower, the account owner gets one email about it with a link to draft a reply.',
    },
    {
      q: 'How much does Eqence cost?',
      a: `Importing and analyzing your reviews is free. A plan lets you draft replies with AI: ${planLineEn}.${enterprise ? ` ${enterprise.name} is $${n(enterprise.monthlyUsd)} a month with unlimited replies and connected sources, by contract.` : ''} Annual billing costs ten times the monthly price, so two months are free. Prices are in US dollars.`,
    },
    {
      q: 'What counts toward my monthly allowance?',
      a: 'Each reply drafted with AI counts as one. Importing reviews, sentiment analysis, alerts and editing a draft do not count. The count starts again on the first day of each month.',
    },
    {
      q: 'How do I pay?',
      a: 'Payment is taken on a secure checkout page run by SmarThinkerz, the company that makes Eqence. You can pay monthly or annually, and your plan becomes active as soon as the payment is confirmed. For questions about billing, email reply@smarthinkerz.com.',
    },
    {
      q: 'Is my Judge.me API token safe?',
      a: 'Your token is encrypted on the server and kept outside the database. It is used only to read your reviews and to post the replies you approve, and it is never shown again after you enter it. Disconnecting a store deletes the stored token.',
    },
    {
      q: 'Can I try Eqence before choosing a plan?',
      a: 'Yes. On the home page you can type a sample review and see a drafted reply with no account. With an account, importing and analyzing your reviews is free without a plan.',
    },
    {
      q: 'Who makes Eqence?',
      a: 'Eqence is made by SmarThinkerz, based in Muscat, Sultanate of Oman. You can reach the team at reply@smarthinkerz.com.',
    },
  ],
  ar: [
    {
      q: 'ما هو Eqence؟',
      a: 'Eqence تطبيق ويب لمتاجر Shopify التي تجمع تقييمات المنتجات عبر Judge.me. يستورد تقييماتك، ويصنّف كل تقييم إلى إيجابي أو محايد أو سلبي أو مختلط، ويقترح ردًا بالذكاء الاصطناعي بلغة العميل، العربية أو الإنجليزية. لا يُنشر أي رد قبل موافقتك.',
    },
    {
      q: 'هل يعمل Eqence مع متجري على Shopify؟',
      a: 'يعمل Eqence مع متاجر Shopify التي تستخدم Judge.me لتقييمات المنتجات. يتصل بحسابك في Judge.me وليس بلوحة تحكم Shopify، لذلك لا يغيّر منتجاتك أو طلباتك أو تصميم متجرك.',
    },
    {
      q: 'كيف أربط متجري؟',
      a: 'أنشئ حسابًا، وافتح صفحة الربط، وأدخل نطاق متجرك ومفتاح Judge.me الخاص. يستورد Eqence تقييماتك الحالية، ثم يُبلغه Judge.me بكل تقييم جديد أو معدّل فور حدوثه. ويعيد Eqence فحص كل متجر مربوط كل ست ساعات تحسبًا لأي إشعار فائت.',
    },
    {
      q: 'هل ينشر Eqence الردود تلقائيًا؟',
      a: 'لا. كل رد مقترح ينتظر قرارك: يمكنك تعديله أو الموافقة عليه أو رفضه. لا يُنشر إلا الرد الذي توافق عليه، بصفته رد متجرك العلني على Judge.me، ويرسله Judge.me إلى صاحب التقييم بالبريد. الرد المرفوض لا يُنشر أبدًا.',
    },
    {
      q: 'ما اللغات التي يدعمها Eqence؟',
      a: 'يقرأ Eqence التقييمات بالعربية والإنجليزية ويقترح كل رد باللغة التي كتب بها العميل. تُكتب الردود العربية بأسلوب طبيعي يناسب عملاء الخليج، ويمكنك إضافة ملاحظات عن اللهجة في إعدادات أسلوب العلامة.',
    },
    {
      q: 'كيف يختار Eqence لغة الرد؟',
      a: 'يعتمد على لغة كلمات العميل نفسها. اسم العميل أو مدينته أو المنتج لا تحدد لغة الرد أبدًا.',
    },
    {
      q: 'هل يقدّم الرد المقترح وعودًا نيابة عني؟',
      a: 'تُكتب الردود المقترحة بحيث لا تخترع استردادًا أو خصمًا أو موعد توصيل أو سياسة أو تغييرًا في طريقة عمل متجرك، ولا تستخدم الرموز التعبيرية، ولا تكرر بيانات شخصية مثل البريد أو الهاتف أو رقم الطلب. عند وجود مشكلة، يعتذر الرد ويدعو العميل للتواصل مع المتجر بشكل خاص. وتبقى أنت من يقرأ كل رد ويوافق عليه قبل نشره.',
    },
    {
      q: 'هل تتبع الردود أسلوب علامتي التجارية؟',
      a: 'نعم. في إعدادات أسلوب العلامة تحدد النبرة والعبارات التي تريد تجنبها والتوقيع. يلتزم بها كل رد جديد، ويُرفض أي رد مقترح يستخدم عبارة منعتها.',
    },
    {
      q: 'كيف يُنبّهني Eqence إلى التقييمات السلبية؟',
      a: 'يمنح Eqence كل تقييم جديد درجة من سالب 1 (سلبي جدًا) إلى موجب 1 (إيجابي جدًا). عندما تكون الدرجة سالب 0.4 أو أقل، يصل إلى صاحب الحساب بريد واحد عن هذا التقييم مع رابط لتجهيز الرد.',
    },
    {
      q: 'كم تكلفة Eqence؟',
      a: `استيراد التقييمات وتحليلها مجاني. الاشتراك يتيح لك تجهيز الردود بالذكاء الاصطناعي: ${planLineAr}.${enterprise ? ` باقة ${enterprise.name} بسعر ${n(enterprise.monthlyUsd)} دولار شهريًا بردود ومصادر مربوطة غير محدودة، بعقد خاص.` : ''} الاشتراك السنوي يساوي عشرة أضعاف السعر الشهري، أي شهرين مجانًا. الأسعار بالدولار الأمريكي.`,
    },
    {
      q: 'ما الذي يُحتسب من الحصة الشهرية؟',
      a: 'كل رد يُقترح بالذكاء الاصطناعي يُحتسب مرة واحدة. استيراد التقييمات وتحليل المشاعر والتنبيهات وتعديل الرد لا تُحتسب. يبدأ العدّ من جديد في أول يوم من كل شهر.',
    },
    {
      q: 'كيف أدفع؟',
      a: 'يتم الدفع عبر صفحة دفع آمنة تديرها SmarThinkerz، الشركة المطوّرة لـ Eqence. يمكنك الدفع شهريًا أو سنويًا، ويُفعّل اشتراكك فور تأكيد الدفع. لأي سؤال عن الفوترة راسلنا على reply@smarthinkerz.com.',
    },
    {
      q: 'هل مفتاح Judge.me الخاص بي آمن؟',
      a: 'يُشفَّر مفتاحك على الخادم ويُحفظ خارج قاعدة البيانات. لا يُستخدم إلا لقراءة تقييماتك ونشر الردود التي توافق عليها، ولا يُعرض مرة أخرى بعد إدخاله. وعند فصل المتجر يُحذف المفتاح المحفوظ.',
    },
    {
      q: 'هل يمكنني تجربة Eqence قبل اختيار باقة؟',
      a: 'نعم. في الصفحة الرئيسية يمكنك كتابة تقييم تجريبي ورؤية رد مقترح دون إنشاء حساب. ومع الحساب، يبقى استيراد التقييمات وتحليلها مجانيًا دون اشتراك.',
    },
    {
      q: 'من يطوّر Eqence؟',
      a: 'تطوّر Eqence شركة SmarThinkerz ومقرها مسقط، سلطنة عُمان. يمكنك التواصل مع الفريق على reply@smarthinkerz.com.',
    },
  ],
};
