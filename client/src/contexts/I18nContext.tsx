import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_URL } from '../lib/api';

type Language = string;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isLoading: boolean;
  /** Re-reads the admin's content overrides (after saving in the editor). */
  reloadContent: () => void;
  /** A site-wide setting saved in the admin (English tab), the same for every language. Empty when unset. */
  setting: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// Hand-crafted translations for EN, JA, AR. These are the defaults; text saved in the
// admin content editor (GET /api/content) overrides them key by key.
export const translations: Record<string, Record<string, string>> = {
  en: {
    'legal.privacy.title': 'Privacy Policy',
    'legal.terms.title': 'Terms of Service',
    'legal.pending': 'This page is being prepared. For questions in the meantime, email reply@smarthinkerz.com.',
    'nav.blog': 'Blog',
    'nav.smarthinkerz': 'Return to SmarThinkerz',
    'blog.hero.title': 'Blog',
    'blog.hero.subtitle': 'Guides and news on managing reviews for Shopify stores, in Arabic and English.',
    'blog.section.title': 'Latest posts',
    'blog.section.subtitle': 'Practical advice on reviews, replies and customer trust.',
    'blog.readmore': 'Read more',
    'blog.back': 'Back to the blog',
    'blog.empty': 'No posts yet. Check back soon.',
    'blog.notfound': 'This post does not exist or is no longer published.',
    'nav.about': 'About',
    'nav.contact': 'Contact',
    'nav.demo': 'Book a demo',
    'about.title': 'About Eqence',
    'about.what': 'Eqence is a web app for Shopify stores that use Judge.me. It imports your store\'s Judge.me product reviews, labels each one positive, neutral, negative or mixed, and drafts a reply with AI in the customer\'s language, Arabic or English.',
    'about.who': 'You can edit every draft, and nothing is posted until you approve it. The approved reply is posted to Judge.me as your store\'s reply.',
    'about.company': 'Eqence is made by SmarThinkerz SPC, a company registered in the Sultanate of Oman under commercial registration 1645162.',
    'about.questions': 'Questions about Eqence:',
    'contact.title': 'Contact',
    'contact.body': 'For questions about Eqence, your account or the plans, email us.',
    'contact.button': 'Email reply@smarthinkerz.com',
    'contact.address': 'SmarThinkerz, P.O. Box 116, Muscat, Sultanate of Oman',
    'demo.title': 'Book a free demo',
    'demo.body': 'In a short call we show Eqence drafting replies to your store\'s own public reviews. Email us your store address and a few times that suit you, and we will reply to arrange it.',
    'demo.button': 'Request a demo by email',
    'demo.subject': 'Eqence demo request',
    'demo.template': 'Store address:\nTimes that suit me (with time zone):\n',
    'demo.fallback': 'If the button does not open your email app, write to',
    'demo.try': 'You can also try it yourself now, with no account:',
    'demo.try.link': 'type a review and see the drafted reply',
    'pricing.unlimited': 'Unlimited',
    'pricing.f.included': 'Review import, sentiment analysis and alerts',
    'pricing.f.source': 'connected source',
    'pricing.f.sources': 'connected sources',
    'pricing.f.replies': 'AI-drafted replies a month',
    'hero.badge': 'For Shopify stores using Judge.me',
    'nav.home': 'Home',
    'nav.features': 'Features',
    'nav.pricing': 'Pricing',
    'nav.login': 'Sign in',
    'nav.register': 'Get started',
    'hero.title': 'Reply to every review, in Arabic and English',
    'hero.subtitle': 'Eqence imports your Shopify store\'s Judge.me reviews, flags the negative ones, and drafts replies that you approve before they are posted.',
    'hero.cta': 'Get started',
    'hero.cta2': 'Watch Demo',
    'features.title': 'What Eqence does today',
    'features.subtitle': 'Everything listed here works now.',
    'features.monitoring': 'Review import',
    'features.monitoring.desc': 'Connect your Judge.me account and your store\'s product reviews are imported and kept up to date.',
    'features.sentiment': 'Sentiment analysis',
    'features.sentiment.desc': 'Every review is labelled positive, neutral, negative or mixed, in Arabic and English. Included with every account.',
    'features.autoresponse': 'AI reply drafts',
    'features.autoresponse.desc': 'One click drafts a reply in the customer\'s language. Nothing is posted until you approve it.',
    'features.analytics': 'Brand voice',
    'features.analytics.desc': 'Set your tone, phrases to avoid and a signature. Drafts follow them.',
    'features.notifications': 'Negative review alerts',
    'features.notifications.desc': 'Eqence scores each new review from minus 1 (very negative) to plus 1 (very positive). When a review scores minus 0.4 or lower, the account owner gets an email.',
    'features.integrations': 'Arabic and English',
    'features.integrations.desc': 'Reads reviews in Arabic and English and drafts the reply in the customer\'s language, Arabic or English.',
    'pricing.title': 'Pricing',
    'pricing.subtitle': 'Importing and analysing your reviews is free. A plan lets you draft replies with AI. Annual billing gives two months free.',
    'pricing.free': 'Free',
    'pricing.starter': 'Starter',
    'pricing.basic': 'Basic',
    'pricing.advance': 'Advance',
    'pricing.premium': 'Premium',
    'pricing.enterprise': 'Enterprise',
    'pricing.mo': '/mo',
    'pricing.cta': 'Get started',
    'pricing.current': 'Current Plan',
    'pricing.contact': 'Contact us',
    'howit.title': 'How It Works',
    'howit.subtitle': 'Three steps',
    'howit.step1': 'Connect Judge.me',
    'howit.step1.desc': 'Paste your Judge.me API token and your reviews are imported.',
    'howit.step2': 'See what needs a reply',
    'howit.step2.desc': 'Each review gets a sentiment label, and strongly negative ones send you an email.',
    'howit.step3': 'Approve and post',
    'howit.step3.desc': 'Draft a reply with AI, edit it if you like, and approve. It is posted as your store\'s reply on Judge.me.',
    'footer.product': 'Product',
    'footer.company': 'Company',
    'footer.support': 'Support',
    'footer.legal': 'Legal',
    'footer.admin': 'Admin Login',
    'login.title': 'Welcome Back',
    'login.subtitle': 'Sign in to your Eqence dashboard',
    'login.email': 'Email Address',
    'login.password': 'Password',
    'login.forgot': 'Forgot Password?',
    'login.submit': 'Sign In',
    'login.register': "Don't have an account? Sign up",
    'register.title': 'Create Your Account',
    'register.subtitle': 'Start managing your reputation today',
    'register.name': 'Full Name',
    'register.store': 'Shopify Store URL',
    'register.email': 'Email Address',
    'register.password': 'Password',
    'register.confirm': 'Confirm Password',
    'register.plan': 'Select Plan',
    'register.submit': 'Create Account',
    'register.login': 'Already have an account? Sign in',
    'waitlist.badge': 'Launching soon',
    'waitlist.title': 'Join the Eqence waitlist',
    'waitlist.subtitle': 'Eqence is not open yet. Leave your details and we will contact you when it launches. Nothing is charged and no account is created.',
    'waitlist.name': 'Your name',
    'waitlist.business': 'Business name',
    'waitlist.email': 'Email address',
    'waitlist.store': 'Shopify store URL',
    'waitlist.plan': 'Plan you are interested in (optional)',
    'waitlist.plan.none': 'Not sure yet',
    'waitlist.submit': 'Join the Waitlist',
    'waitlist.sending': 'Sending…',
    'waitlist.done.title': "You're on the list",
    'waitlist.done.body': 'Thanks. Eqence is launching soon and we will email you when it is ready.',
    'waitlist.error': 'Something went wrong and your details were not sent. Please try again, or email reply@smarthinkerz.com.',
    'waitlist.back': 'Back to home',
    'dashboard.title': 'Dashboard',
    'dashboard.reputation': 'Reputation Score',
    'dashboard.reviews': 'Total Reviews',
    'dashboard.response': 'Response Rate',
    'dashboard.sentiment': 'Positive Sentiment',
    'forgot.title': 'Reset Your Password',
    'forgot.subtitle': 'Enter your email and we\'ll send you a reset link',
    'forgot.email': 'Email Address',
    'forgot.submit': 'Send Reset Link',
    'forgot.back': 'Back to Login',
    'reset.title': 'Set New Password',
    'reset.password': 'New Password',
    'reset.confirm': 'Confirm New Password',
    'reset.submit': 'Reset Password',
    'payment.title': 'Complete Your Payment',
    'payment.subtitle': 'Secure payment powered by Tap Payments',
  },
  ja: {
    'legal.privacy.title': 'プライバシーポリシー',
    'legal.terms.title': '利用規約',
    'legal.pending': 'このページは準備中です。ご不明な点は reply@smarthinkerz.com までお問い合わせください。',
    'nav.blog': 'ブログ',
    'nav.smarthinkerz': 'SmarThinkerz に戻る',
    'blog.hero.title': 'ブログ',
    'blog.hero.subtitle': 'Shopify ストアのレビュー管理に関するガイドとお知らせ。',
    'blog.section.title': '最新の記事',
    'blog.section.subtitle': 'レビュー、返信、顧客の信頼に関する実践的なヒント。',
    'blog.readmore': '続きを読む',
    'blog.back': 'ブログに戻る',
    'blog.empty': 'まだ記事はありません。',
    'blog.notfound': 'この記事は存在しないか、公開されていません。',
    'pricing.unlimited': '無制限',
    'pricing.f.included': 'レビュー取り込み・感情分析・通知',
    'pricing.f.source': '件の接続ソース',
    'pricing.f.sources': '件の接続ソース',
    'pricing.f.replies': '件の AI 返信下書き / 月',
    'hero.badge': 'Judge.me をお使いの Shopify ストア向け',
    'nav.home': 'ホーム',
    'nav.features': '機能',
    'nav.pricing': '料金',
    'nav.login': 'ログイン',
    'nav.register': 'はじめる',
    'hero.title': 'すべてのレビューに、アラビア語と英語で返信',
    'hero.subtitle': 'Eqence は Shopify ストアの Judge.me レビューを取り込み、ネガティブなものを知らせ、返信の下書きを作成します。投稿はあなたの承認後です。',
    'hero.cta': 'はじめる',
    'hero.cta2': 'デモを見る',
    'features.title': 'Eqence が今できること',
    'features.subtitle': 'ここに記載の機能はすべて現在ご利用いただけます。',
    'features.monitoring': 'レビューの取り込み',
    'features.monitoring.desc': 'Judge.me アカウントを接続すると、ストアの商品レビューが取り込まれ、最新の状態に保たれます。',
    'features.sentiment': '感情分析',
    'features.sentiment.desc': 'すべてのレビューをポジティブ・中立・ネガティブ・混合に分類します。アラビア語と英語に対応。全アカウントに含まれます。',
    'features.autoresponse': 'AI 返信下書き',
    'features.autoresponse.desc': 'ワンクリックでお客様の言語の返信下書きを作成。承認するまで投稿されません。',
    'features.analytics': 'ブランドボイス',
    'features.analytics.desc': 'トーン、避けたい表現、署名を設定すると、下書きに反映されます。',
    'features.notifications': 'ネガティブレビュー通知',
    'features.notifications.desc': 'Eqence は新しいレビューをマイナス1（とてもネガティブ）からプラス1（とてもポジティブ）で採点します。マイナス0.4以下のレビューは、アカウントの所有者にメールでお知らせします。',
    'features.integrations': 'アラビア語と英語',
    'features.integrations.desc': 'アラビア語と英語のレビューを読み取り、お客様の言語（アラビア語または英語）で返信を下書きします。',
    'pricing.title': '料金',
    'pricing.subtitle': 'レビューの取り込みと分析は無料です。プランに加入すると AI で返信を下書きできます。年払いは2か月分無料です。',
    'pricing.free': '無料',
    'pricing.starter': 'スターター',
    'pricing.basic': 'ベーシック',
    'pricing.advance': 'アドバンス',
    'pricing.premium': 'プレミアム',
    'pricing.enterprise': 'エンタープライズ',
    'pricing.mo': '/月',
    'pricing.cta': 'はじめる',
    'pricing.current': '現在のプラン',
    'pricing.contact': 'お問い合わせ',
    'howit.title': '使い方',
    'howit.subtitle': '3つのステップ',
    'howit.step1': 'Judge.me を接続',
    'howit.step1.desc': 'Judge.me の API トークンを貼り付けると、レビューが取り込まれます。',
    'howit.step2': '返信が必要なレビューを確認',
    'howit.step2.desc': '各レビューに感情ラベルが付き、強くネガティブなものはメールで通知されます。',
    'howit.step3': '承認して投稿',
    'howit.step3.desc': 'AI で下書きを作成し、必要なら編集して承認。Judge.me 上でストアの返信として投稿されます。',
    'footer.product': '製品',
    'footer.company': '会社',
    'footer.support': 'サポート',
    'footer.legal': '法的情報',
    'footer.admin': '管理者ログイン',
    'login.title': 'おかえりなさい',
    'login.subtitle': 'Eqenceダッシュボードにサインイン',
    'login.email': 'メールアドレス',
    'login.password': 'パスワード',
    'login.forgot': 'パスワードをお忘れですか？',
    'login.submit': 'サインイン',
    'login.register': 'アカウントをお持ちでない方はこちら',
    'register.title': 'アカウント作成',
    'register.subtitle': '今日からレピュテーション管理を始めましょう',
    'register.name': '氏名',
    'register.store': 'ShopifyストアURL',
    'register.email': 'メールアドレス',
    'register.password': 'パスワード',
    'register.confirm': 'パスワード確認',
    'register.plan': 'プラン選択',
    'register.submit': 'アカウント作成',
    'register.login': 'すでにアカウントをお持ちの方',
    'dashboard.title': 'ダッシュボード',
    'dashboard.reputation': '評判スコア',
    'dashboard.reviews': '総レビュー数',
    'dashboard.response': '応答率',
    'dashboard.sentiment': 'ポジティブ感情',
    'forgot.title': 'パスワードリセット',
    'forgot.subtitle': 'メールアドレスを入力してリセットリンクを受け取る',
    'forgot.email': 'メールアドレス',
    'forgot.submit': 'リセットリンク送信',
    'forgot.back': 'ログインに戻る',
    'reset.title': '新しいパスワード設定',
    'reset.password': '新しいパスワード',
    'reset.confirm': 'パスワード確認',
    'reset.submit': 'パスワードリセット',
    'payment.title': 'お支払い完了',
    'payment.subtitle': 'Tap Paymentsによる安全な決済',
  },
  ar: {
    'legal.privacy.title': 'سياسة الخصوصية',
    'legal.terms.title': 'شروط الخدمة',
    'legal.pending': 'يجري إعداد هذه الصفحة. للاستفسار في الأثناء، راسلنا على reply@smarthinkerz.com.',
    'nav.blog': 'المدونة',
    'nav.smarthinkerz': 'العودة إلى SmarThinkerz',
    'blog.hero.title': 'المدونة',
    'blog.hero.subtitle': 'أدلة وأخبار حول إدارة التقييمات لمتاجر Shopify، بالعربية والإنجليزية.',
    'blog.section.title': 'أحدث المقالات',
    'blog.section.subtitle': 'نصائح عملية حول التقييمات والردود وثقة العملاء.',
    'blog.readmore': 'اقرأ المزيد',
    'blog.back': 'العودة إلى المدونة',
    'blog.empty': 'لا توجد مقالات بعد. عد قريبًا.',
    'blog.notfound': 'هذه المقالة غير موجودة أو لم تعد منشورة.',
    'nav.about': 'عن Eqence',
    'nav.contact': 'تواصل معنا',
    'nav.demo': 'احجز عرضًا توضيحيًا',
    'about.title': 'عن Eqence',
    'about.what': 'Eqence تطبيق ويب لمتاجر Shopify التي تستخدم Judge.me. يستورد تقييمات منتجات متجرك من Judge.me، ويصنّف كل تقييم إلى إيجابي أو محايد أو سلبي أو مختلط، ويجهّز ردًا بالذكاء الاصطناعي بلغة العميل، العربية أو الإنجليزية.',
    'about.who': 'يمكنك تعديل كل مسودة، ولا يُنشر شيء قبل موافقتك. يُنشر الرد المعتمد على Judge.me كردّ متجرك.',
    'about.company': 'Eqence من تطوير شركة سمارثينكرز ش.ش.و، المسجلة في سلطنة عمان بالسجل التجاري رقم 1645162.',
    'about.questions': 'للاستفسار عن Eqence:',
    'contact.title': 'تواصل معنا',
    'contact.body': 'لأي سؤال عن Eqence أو حسابك أو الباقات، راسلنا بالبريد الإلكتروني.',
    'contact.button': 'راسل reply@smarthinkerz.com',
    'contact.address': 'سمارثينكرز، ص.ب 116، مسقط، سلطنة عمان',
    'demo.title': 'احجز عرضًا توضيحيًا مجانيًا',
    'demo.body': 'في مكالمة قصيرة نعرض لك كيف يجهّز Eqence ردودًا على التقييمات العامة لمتجرك. أرسل لنا عنوان متجرك وبعض الأوقات المناسبة لك، وسنرد عليك لترتيب الموعد.',
    'demo.button': 'اطلب عرضًا بالبريد الإلكتروني',
    'demo.subject': 'طلب عرض توضيحي لـ Eqence',
    'demo.template': 'عنوان المتجر:\nالأوقات المناسبة لي (مع المنطقة الزمنية):\n',
    'demo.fallback': 'إذا لم يفتح الزر تطبيق البريد لديك، راسلنا على',
    'demo.try': 'ويمكنك أيضًا تجربته بنفسك الآن، دون حساب:',
    'demo.try.link': 'اكتب تقييمًا وشاهد الرد المقترح',
    'howit.step3.desc': 'جهّز ردًا بالذكاء الاصطناعي، عدّله إن أردت، ثم وافق. يُنشر كردّ متجرك على Judge.me.',
    'howit.step3': 'وافق وانشر',
    'howit.step2.desc': 'يحصل كل تقييم على تصنيف للمشاعر، والتقييمات شديدة السلبية تُرسل لك تنبيهًا بالبريد.',
    'howit.step2': 'اعرف ما يحتاج ردًا',
    'howit.step1.desc': 'الصق رمز API الخاص بـ Judge.me وستُستورد تقييماتك.',
    'howit.step1': 'اربط Judge.me',
    'howit.subtitle': 'ثلاث خطوات',
    'pricing.unlimited': 'غير محدود',
    'pricing.f.included': 'استيراد التقييمات وتحليل المشاعر والتنبيهات',
    'pricing.f.source': 'مصدر مرتبط',
    'pricing.f.sources': 'مصادر مرتبطة',
    'pricing.f.replies': 'رد بالذكاء الاصطناعي شهريًا',
    'features.integrations.desc': 'يقرأ التقييمات بالعربية والإنجليزية ويجهّز الرد بلغة العميل، العربية أو الإنجليزية.',
    'features.integrations': 'العربية والإنجليزية',
    'features.notifications.desc': 'يمنح Eqence كل تقييم جديد درجة من سالب 1 (سلبي جدًا) إلى موجب 1 (إيجابي جدًا). إذا كانت الدرجة سالب 0.4 أو أقل، يصل بريد إلكتروني إلى صاحب الحساب.',
    'features.notifications': 'تنبيهات التقييمات السلبية',
    'features.analytics.desc': 'حدّد نبرتك والعبارات التي تتجنبها وتوقيعك، وتلتزم المسودات بها.',
    'features.analytics': 'أسلوب علامتك',
    'features.autoresponse.desc': 'بضغطة واحدة تُجهَّز مسودة رد بلغة العميل. لا يُنشر شيء قبل موافقتك.',
    'features.autoresponse': 'مسودات ردود بالذكاء الاصطناعي',
    'features.sentiment.desc': 'يُصنَّف كل تقييم إلى إيجابي أو محايد أو سلبي أو مختلط، بالعربية والإنجليزية. متاح مع كل حساب.',
    'features.sentiment': 'تحليل المشاعر',
    'features.monitoring.desc': 'اربط حسابك في Judge.me لتُستورد تقييمات منتجات متجرك وتبقى محدّثة.',
    'features.monitoring': 'استيراد التقييمات',
    'hero.badge': 'لمتاجر Shopify التي تستخدم Judge.me',
    'nav.home': 'الرئيسية',
    'nav.features': 'المميزات',
    'nav.pricing': 'الأسعار',
    'nav.login': 'تسجيل الدخول',
    'nav.register': 'ابدأ الآن',
    'hero.title': 'ردّ على كل تقييم، بالعربية والإنجليزية',
    'hero.subtitle': 'يستورد Eqence تقييمات متجرك على Shopify من Judge.me، ينبّهك للسلبية منها، ويجهّز ردودًا توافق عليها قبل نشرها.',
    'hero.cta': 'ابدأ الآن',
    'hero.cta2': 'شاهد العرض',
    'features.title': 'ما يقدمه Eqence اليوم',
    'features.subtitle': 'كل ما هو مذكور هنا يعمل الآن.',
    'pricing.title': 'الأسعار',
    'pricing.subtitle': 'استيراد التقييمات وتحليلها مجاني. الاشتراك يتيح لك تجهيز الردود بالذكاء الاصطناعي. الاشتراك السنوي يمنحك شهرين مجانًا.',
    'pricing.mo': '/شهر',
    'pricing.cta': 'ابدأ الآن',
    'pricing.contact': 'تواصل معنا',
    'login.title': 'مرحباً بعودتك',
    'login.subtitle': 'سجل دخولك إلى لوحة تحكم Eqence',
    'login.email': 'البريد الإلكتروني',
    'login.password': 'كلمة المرور',
    'login.forgot': 'نسيت كلمة المرور؟',
    'login.submit': 'تسجيل الدخول',
    'footer.admin': 'دخول المسؤول',
    'footer.product': 'المنتج',
    'footer.company': 'الشركة',
    'footer.support': 'الدعم',
    'dashboard.title': 'لوحة التحكم',
    'forgot.title': 'إعادة تعيين كلمة المرور',
    'forgot.submit': 'إرسال رابط إعادة التعيين',
    'payment.title': 'إتمام الدفع',
  },
};

// Google Translate free endpoint for auto-translation
async function translateText(text: string, targetLang: string): Promise<string> {
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
    );
    const data = await res.json();
    return data[0]?.map((item: any[]) => item[0]).join('') || text;
  } catch {
    return text;
  }
}

// Detect user's country via IP
async function detectCountry(): Promise<string> {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return data.country_code || 'US';
  } catch {
    return 'US';
  }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    return localStorage.getItem('eqence_lang') || 'en';
  });
  const [autoTranslations, setAutoTranslations] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});

  const reloadContent = useCallback(() => {
    fetch(`${API_URL}/api/content`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.overrides) setOverrides(j.overrides); })
      .catch(() => { /* the built-in text stays */ });
  }, []);
  useEffect(() => { reloadContent(); }, [reloadContent]);

  // Arabic pages read right to left.
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  // IP-based language detection on first visit
  useEffect(() => {
    const hasManualChoice = localStorage.getItem('eqence_lang_manual');
    if (hasManualChoice) return;

    detectCountry().then((country) => {
      if (country === 'JP') {
        setLanguageState('ja');
        localStorage.setItem('eqence_lang', 'ja');
      } else {
        setLanguageState('en');
        localStorage.setItem('eqence_lang', 'en');
      }
    });
  }, []);

  // Auto-translate when language changes to non-supported language
  useEffect(() => {
    if (['en', 'ja', 'ar'].includes(language)) {
      setAutoTranslations({});
      return;
    }

    setIsLoading(true);
    const enKeys = Object.entries(translations.en);
    
    Promise.all(
      enKeys.map(async ([key, value]) => {
        const translated = await translateText(value, language);
        return [key, translated] as [string, string];
      })
    ).then((results) => {
      const map: Record<string, string> = {};
      results.forEach(([key, val]) => { map[key] = val; });
      setAutoTranslations(map);
      setIsLoading(false);
    });
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('eqence_lang', lang);
    localStorage.setItem('eqence_lang_manual', 'true');
  }, []);

  const setting = useCallback((key: string): string => (overrides.en?.[key] ?? '').trim(), [overrides]);

  const t = useCallback((key: string): string => {
    // Admin-edited text wins, then the hand-crafted translations
    if (overrides[language]?.[key]) return overrides[language][key];
    if (translations[language]?.[key]) {
      return translations[language][key];
    }
    // Check auto-translations
    if (autoTranslations[key]) {
      return autoTranslations[key];
    }
    // Fallback to English
    return overrides.en?.[key] || translations.en[key] || key;
  }, [language, autoTranslations, overrides]);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, isLoading, reloadContent, setting }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
