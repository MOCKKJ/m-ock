/**
 * MockJ — Privacy Policy
 * Route: /privacy
 */
import { useNavigate } from 'react-router-dom';
import logoImg from '@/assets/mockj-logo.png';

const RED = 'hsl(4 90% 58%)';
const VIOLET = 'hsl(265 80% 65%)';

const SECTIONS = [
  {
    number: '1',
    title: 'What We Collect',
    color: RED,
    bullets: [
      {
        label: 'Information You Provide Directly',
        text: 'Your name, email address, username, profile photo, and any other information you submit when creating an account or using platform features.',
      },
      {
        label: 'Automatic Technical Data',
        text: 'IP address, browser type, operating system, device type, device fingerprint (for rate limiting), session IDs, and referring URLs. This data is standard for platform security and analytics.',
      },
      {
        label: 'Usage & Behavioral Data',
        text: 'How you interact with MockJ — features used, chat sessions, images and videos generated, voice commands, token transactions, and page views. This helps us improve product quality and personalize your experience.',
      },
      {
        label: 'Payment Data',
        text: 'Payment processing is handled exclusively by Stripe. MockJ does not store full card numbers or CVVs. We retain Stripe customer IDs and subscription metadata (plan, status, billing period).',
      },
      {
        label: 'AI Conversation Data',
        text: 'Text messages, prompts, and uploaded content you submit to the AI. Conversations are stored securely in our database and used to provide the service (including Project Memory features, if enabled).',
      },
    ],
  },
  {
    number: '2',
    title: 'How We Use Your Data',
    color: VIOLET,
    bullets: [
      {
        label: 'Service Delivery',
        text: 'To operate the platform, process your requests, generate AI responses, images, video, and voice output.',
      },
      {
        label: 'Security & Fraud Prevention',
        text: 'To detect and prevent abuse, bot activity, unauthorized access, and violations of our Terms of Service. Device fingerprinting and rate limiting are applied server-side.',
      },
      {
        label: 'Communications',
        text: 'To send transactional emails (OTP verification, password reset, billing receipts). Marketing communications are only sent with your opt-in consent.',
      },
      {
        label: 'Product Improvement',
        text: 'Aggregated, anonymized usage analytics help us understand which features are valuable and where the product can be improved. We do not use your personal AI conversations for model training without your explicit consent.',
      },
      {
        label: 'Legal Compliance',
        text: 'To comply with applicable legal obligations, respond to lawful requests from authorities, and enforce our Terms of Service.',
      },
    ],
  },
  {
    number: '3',
    title: 'Tracking & Cookies',
    color: RED,
    content: `We use browser cookies and local storage to maintain your session, remember authentication state, and store user preferences. Session cookies expire when you close your browser. Persistent cookies may remain for up to 12 months. You can disable cookies in your browser settings, but certain platform features (including login persistence) may not function correctly. We do not use advertising cookies or third-party behavioral tracking pixels at this time. If that changes, this policy will be updated with specific disclosure.`,
  },
  {
    number: '4',
    title: 'Third-Party Sharing',
    color: VIOLET,
    content: `We do not sell, rent, or trade your personal data to third parties. Period. We only share data with trusted "Data Processors" — service providers that operate under contractual obligations to protect your data and use it solely for the specific task we assign:`,
    bullets: [
      { label: 'OnSpace Cloud / Supabase', text: 'Database hosting, authentication, file storage, and edge function execution.' },
      { label: 'Stripe', text: 'Payment processing, subscription management, and fraud detection.' },
      { label: 'ElevenLabs', text: 'Text-to-speech audio synthesis for voice output features.' },
      { label: 'OnSpace AI', text: 'AI model inference for chat, image generation, and video generation.' },
      { label: 'Legal Disclosure', text: 'We may disclose your information if required by law, court order, or governmental authority, or if necessary to protect the rights, property, or safety of MockJ, its users, or the public.' },
    ],
  },
  {
    number: '5',
    title: 'Your Rights',
    color: RED,
    bullets: [
      {
        label: 'Right to Know',
        text: 'You can request a summary of the personal data we hold about you by emailing privacy@mockj.ai.',
      },
      {
        label: 'Right to Delete ("Right to be Forgotten")',
        text: 'You can request deletion of your account and associated personal data at any time via Account Settings → Delete Account, or by contacting privacy@mockj.ai. We will process deletion requests within 30 days.',
      },
      {
        label: 'Right to Data Portability',
        text: 'You can request an export of your data (conversation history, generated content) in a machine-readable format.',
      },
      {
        label: 'Right to Correction',
        text: 'You can update your profile information directly in Account Settings at any time.',
      },
      {
        label: 'California Residents (CCPA/CPRA)',
        text: 'California residents have the right to know what personal information is collected, the right to delete, the right to opt-out of "sharing" (we don\'t share for advertising), and the right to non-discrimination for exercising privacy rights. Submit requests to privacy@mockj.ai.',
      },
      {
        label: 'EU/EEA Residents (GDPR)',
        text: 'If you are in the European Economic Area, you have rights under GDPR including access, rectification, erasure, restriction of processing, data portability, and the right to object. Our legal basis for processing is "Contractual Necessity" for service delivery and "Legitimate Interest" for security and analytics. You may also lodge a complaint with your local supervisory authority.',
      },
    ],
  },
  {
    number: '6',
    title: 'Data Security',
    color: VIOLET,
    content: `We implement industry-standard security measures including TLS/SSL encryption in transit, encrypted storage, Row-Level Security (RLS) on all database tables, and access controls limiting which systems can read your data. API keys and secrets are stored as environment variables in secure secret management systems. We conduct periodic security reviews. However, no system connected to the internet is 100% secure. You are responsible for maintaining a strong, unique password and for the security of your account credentials. We will notify you of any data breach that poses significant risk to your rights within the timeframe required by applicable law.`,
  },
  {
    number: '7',
    title: "Children's Privacy",
    color: RED,
    content: `MockJ is not directed to children under the age of 13, and we do not knowingly collect personal information from children under 13. If we become aware that a user is under 13 and has provided personal information without verifiable parental consent, we will delete that account and associated data immediately. If you believe a child under 13 is using MockJ, please contact us at privacy@mockj.ai.`,
  },
  {
    number: '8',
    title: 'Data Retention',
    color: VIOLET,
    content: `We retain your account data for as long as your account is active. Conversation and generation history is retained for service functionality (e.g., Project Memory). After account deletion, personal data is purged from live systems within 30 days; anonymized aggregated analytics data may be retained indefinitely. Backup copies may persist for up to 90 days before being overwritten.`,
  },
  {
    number: '9',
    title: 'Do Not Sell My Personal Information',
    color: RED,
    content: `MockJ does not sell personal information to third parties for monetary or other valuable consideration. We are not data brokers. This applies to all users, including California residents exercising rights under CCPA/CPRA. If our practices ever change, we will update this policy and provide a prominent opt-out mechanism before any such change takes effect.`,
  },
  {
    number: '10',
    title: 'Changes to This Policy',
    color: VIOLET,
    content: `If we make material changes to how we collect, use, or share your data, we will notify you via the email address associated with your account and display a prominent notice in the app at least 14 days before the changes take effect. Non-material changes (typos, clarifications) may be updated without notification. The "Last Updated" date at the top of this page always reflects the most recent revision.`,
  },
  {
    number: '11',
    title: 'Contact Us',
    color: RED,
    content: `For privacy-related questions, data requests, or complaints:\n\nPrivacy inquiries: privacy@mockj.ai\nLegal notices: legal@mockj.ai\nGeneral support: support@mockj.ai\n\nMockJ / MLTXPRO — mockk.online`,
  },
];

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[hsl(224_20%_4%)] text-foreground" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center gap-4 px-6 py-3 border-b border-white/5 backdrop-blur-xl bg-[hsl(224_20%_4%_/_0.92)]">
        <button onClick={() => navigate('/landing')} className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg overflow-hidden">
            <img src={logoImg} alt="MockJ" className="w-full h-full object-cover" />
          </div>
          <span className="font-black text-sm text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            MockJ <span style={{ color: RED }}>4</span>
          </span>
        </button>
        <div className="flex-1" />
        <button
          onClick={() => navigate('/')}
          className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
          style={{ background: RED, color: '#fff' }}
        >
          Launch App
        </button>
      </nav>

      {/* Header */}
      <header className="py-16 px-6 text-center border-b border-white/[0.04]" style={{ background: 'hsl(224 15% 6%)' }}>
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-6 text-xs font-bold" style={{ borderColor: 'hsl(265 80% 65% / 0.3)', color: VIOLET, background: 'hsl(265 80% 65% / 0.07)' }}>
            Legal Document
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Privacy Policy
          </h1>
          <p className="text-muted-foreground text-base">
            Last updated: June 2025 &nbsp;·&nbsp; Effective immediately
          </p>
          <p className="text-muted-foreground/60 text-sm mt-3 max-w-xl mx-auto leading-relaxed">
            Your privacy matters. This policy explains exactly what data we collect, how we use it,
            and the rights you have over it. We don't sell your data. Ever.
          </p>
        </div>
      </header>

      {/* TL;DR Summary Card */}
      <div className="max-w-3xl mx-auto px-6 pt-12">
        <div
          className="rounded-2xl p-6 mb-4"
          style={{ background: 'hsl(224 15% 7%)', border: '1px solid hsl(265 80% 65% / 0.2)' }}
        >
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: VIOLET }}>TL;DR — The Short Version</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              'We collect your email, usage data, and AI conversations to run the service.',
              'We do NOT sell your personal data. We are not a data broker.',
              'Payments are handled by Stripe — we never see your full card number.',
              'You can delete your account and all associated data at any time.',
              'We use cookies only to keep you logged in, not for advertising.',
              'EU/California users have full GDPR/CCPA rights — just email us.',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-base" style={{ color: VIOLET }}>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-12 pb-16">
        {SECTIONS.map((section) => (
          <section key={section.number}>
            <div className="flex items-start gap-4 mb-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 mt-0.5"
                style={{
                  background: `${section.color.replace(')', ' / 0.12)')}`,
                  border: `1px solid ${section.color.replace(')', ' / 0.25)')}`,
                  color: section.color,
                }}
              >
                {section.number}
              </div>
              <h2 className="text-xl font-bold text-foreground pt-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {section.title}
              </h2>
            </div>
            {section.content && (
              <p className="text-sm text-muted-foreground leading-relaxed ml-12 whitespace-pre-line">
                {section.content}
              </p>
            )}
            {section.bullets && (
              <ul className="ml-12 space-y-3">
                {section.bullets.map((b) => (
                  <li key={b.label} className="text-sm text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground/80">{b.label}: </span>
                    {b.text}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {/* GDPR/CCPA Notice */}
        <div
          className="rounded-2xl p-6 text-sm text-muted-foreground leading-relaxed"
          style={{ background: 'hsl(224 15% 7%)', border: '1px solid hsl(224 15% 13%)' }}
        >
          <p className="font-semibold text-foreground/70 mb-2">⚠ Legal Notice</p>
          <p>
            This Privacy Policy is provided as a general framework. If you handle sensitive data
            categories (health, financial, biometric) or operate in regulated industries, additional
            compliance layers (HIPAA, PCI-DSS) may be required. For a legally binding policy
            tailored to your specific jurisdiction and data practices, consult a licensed attorney
            specializing in data privacy law.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-8 px-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/50">
          <span>© 2025 MockJ · MLTXPRO · All rights reserved.</span>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/terms')} className="hover:text-foreground transition-colors">Terms of Service</button>
            <span className="opacity-30">·</span>
            <button onClick={() => navigate('/privacy')} className="hover:text-foreground transition-colors" style={{ color: VIOLET }}>Privacy Policy</button>
            <span className="opacity-30">·</span>
            <a href="mailto:privacy@mockj.ai" className="hover:text-foreground transition-colors">privacy@mockj.ai</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
