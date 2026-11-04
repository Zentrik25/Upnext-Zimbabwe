import type { AdMode } from "@/lib/adsense";
import type { LegalDocument } from "./types";

const GOOGLE_PRIVACY = "https://policies.google.com/privacy";
const GOOGLE_ADS_TECH = "https://policies.google.com/technologies/ads";
const GOOGLE_PARTNER_SITES = "https://policies.google.com/technologies/partner-sites";
const GOOGLE_AD_SETTINGS = "https://adssettings.google.com";

/** Section 6A. What is true TODAY depends on the owner's advertising status; the rest explains how Google's
 *  advertising works so that the text is ready before activation. Google's own pages are the authority on what
 *  Google does; this policy links to them rather than restating them. */
function advertisingSection(ads: AdMode): LegalDocument["sections"][number] {
  const status =
    ads === "live"
      ? "**Current status.** UPNEXT Careers shows advertisements provided by **Google AdSense** on some public pages: individual opportunity pages and guides. Each one is labelled “Advertisement” and sits apart from the page text. Advertisements are never shown on the sign-in, registration, account, saved, alert or staff pages, and never next to the Apply, Save, Share or navigation buttons. **Nothing from Google’s advertising services is loaded until you allow advertising** (see “Your choices” below)."
      : ads === "verify"
        ? "**Current status.** UPNEXT Careers does **not** show advertisements at the moment. As part of applying to Google AdSense, our public pages currently load a script from Google so that Google can confirm that we own the site. Because that check has to find the script in the page, it loads for every visitor, before any choice is offered, and Google may handle information about your visit (for example your network address and browser details) and may use cookies or similar technologies as described below. If you do not want this, you can block the script in your browser."
        : "**Current status.** UPNEXT Careers does **not** currently show advertisements, does not load Google’s advertising scripts and does not set advertising cookies. We may apply to use **Google AdSense** to help pay for the service. This section explains how that would work, so that you can see it in advance. We will change this section, and ask for your permission as described below, before any advertising is switched on.";
  return {
    id: "advertising",
    title: "6A. Advertising (Google AdSense)",
    blocks: [
      { t: "p", text: status },
      {
        t: "p",
        text: "**How Google may use cookies and similar technologies.** When advertising is shown, Google and the companies it works with may use cookies, device identifiers and similar technologies to deliver, measure and limit advertisements, to detect fraud and abuse, and to show advertisements that are based on your earlier visits to this and other websites (**personalised** advertising) or only on the page you are viewing and general information such as your approximate location (**non-personalised** advertising). Non-personalised advertisements can still involve cookies, for example to count how often an advertisement is shown.",
      },
      {
        t: "p",
        text: `**What Google may receive.** To show and measure an advertisement, Google may receive your network (IP) address, browser and device details, the address of the page you are viewing, cookie or device identifiers, and how you interact with the advertisement. Google handles that information under its own policies, not ours: [Google’s Privacy Policy](${GOOGLE_PRIVACY}), [how Google uses cookies in advertising](${GOOGLE_ADS_TECH}) and [how Google uses information from sites that use its services](${GOOGLE_PARTNER_SITES}). Google may process it outside Zimbabwe (see section 8). Advertisers may also see aggregated results from Google.`,
      },
      {
        t: "p",
        text: "**What we do not pass to Google.** UPNEXT does not give Google your account details, profile, saved listings, job-alert choices or anything you type into the site for advertising purposes. Advertisements are not chosen from them, and the advertising choice you make (below) stays in your browser.",
      },
      {
        t: "p",
        text: "**Where advertisements may appear.** Only on public, read-only content pages: an individual opportunity page and the guides. Advertisements are labelled, are kept apart from the page text, and are placed so that they are not mistaken for UPNEXT’s own buttons or links.",
      },
      {
        t: "p",
        text: "**People in the European Economic Area, the United Kingdom and Switzerland.** Under the laws that apply there, advertising cookies and similar technologies generally need your prior consent. We do not locate visitors, so we apply the same rule to everyone: when advertising is on, Google’s advertising technologies load only after you choose “Allow advertisements”, and if you choose “No advertisements” (or do nothing) none is loaded and no advertisement is shown. You can change your mind at any time using the control in the advertisement box on any page that can show advertisements (an opportunity page or a guide).",
      },
      {
        t: "ul",
        items: [
          "**Your choice on UPNEXT.** Use the control in the advertisement box (“Allow advertisements” or “Stop advertisements”) on any opportunity page or guide. It is remembered in this browser only, in local storage under the name **upnext-ad-consent**; it is not a cookie and it is never sent to us. Clearing your browser data resets it.",
          `**Personalised advertising.** You can manage or switch off personalised advertising from Google at [Google Ad Settings](${GOOGLE_AD_SETTINGS}).`,
          "**Industry opt-out tools.** You can also use [Your Online Choices](https://www.youronlinechoices.com) (Europe), the [Digital Advertising Alliance](https://optout.aboutads.info) (United States) or the [Network Advertising Initiative](https://optout.networkadvertising.org), and your browser’s settings to block or delete cookies. Blocking cookies in your browser can stop advertisements from working and does not affect the rest of UPNEXT.",
          "**Your other rights** over information that we hold are in section 12. Information that Google holds is governed by Google’s own policy, linked above.",
        ],
      },
    ],
  };
}

/** Every statement below is traced to the code or a decision in docs/legal/CODE_TO_POLICY_CHECKLIST.md. The text depends
 *  on the advertising status set by the owner (lib/adsense.ts): `off` is the default and claims no advertising. */
export function privacyFor(ads: AdMode = "off"): LegalDocument {
  const advertising = ads !== "off";
  return {
    slug: "privacy",
    title: "Privacy Policy",
    description:
      "How UPNEXT Careers collects, uses, shares, keeps and protects personal information, and how to exercise your rights.",
    intro:
      "This policy explains what personal information UPNEXT Careers collects, why, who can see it, how long it is kept and what you can do about it. We have written it to be read, not skimmed past.",
    version: "1.2",
    effective: "2026-11-03",
    updated: "2026-11-03",
    history: [
      {
        version: "1.2",
        effective: "2026-11-03",
        summary:
          "Added section 6A on Google AdSense advertising, with what applies today, how Google may use cookies, your choices and the rules for the EEA, the United Kingdom and Switzerland.",
      },
      {
        version: "1.1",
        effective: "2026-10-29",
        summary:
          "Registration now asks for a phone number and records when you agreed to these documents; you can also sign in with Google.",
      },
      { version: "1.0", effective: "2026-10-29", summary: "First full version of the Privacy Policy." },
    ],
    sections: [
      {
        id: "who-we-are",
        title: "1. Who we are and what this policy covers",
        blocks: [
          {
            t: "p",
            text: "UPNEXT Careers (**UPNEXT**, **we**, **us**) is a website at https://upnext.co.zw that lists jobs, internships, graduate programmes, scholarships, tenders and grants in Zimbabwe. It is operated by **Zentrik Solutions (Pvt) Ltd**, Zimbabwe, which decides how and why the personal information described here is used and is the “data controller” for it.",
          },
          {
            t: "p",
            text: "This policy applies to everyone who uses the website: visitors who only browse, jobseekers with an account, employers and their authorised representatives, people who report a listing, and people who write to us. It does not cover other websites that a listing links to; their owners are responsible for those.",
          },
          {
            t: "p",
            text: "To ask a question about this policy or to use any of your rights, write to **support@upnext.co.zw**. For general enquiries, corrections to listings and anything else, write to **info@upnext.co.zw**. See also [Contact](/contact).",
          },
        ],
      },
      {
        id: "information-we-collect",
        title: "2. Personal information we collect",
        blocks: [
          {
            t: "p",
            text: "We collect only what the features you use need. We do not collect your date of birth, gender, national identity number, photograph, CV or other uploaded documents, payment details or precise location.",
          },
          {
            t: "table",
            caption: "Information collected, by who you are",
            head: ["If you are…", "What we collect"],
            rows: [
              [
                "A visitor browsing without an account",
                "The page you ask for, the time, the result and a request number, together with your network (IP) address, in technical server logs. When you open a listing or follow its apply link we add one to a daily count for that listing. The count holds no cookie, identifier, address or browser details.",
              ],
              [
                "A jobseeker with an account",
                "Your e-mail address, the name you give us, the phone number you give when you register, a record of when you agreed to the Terms of Service and this policy and to which version, a one-way hash of your password (never the password itself), the listings you save, and your e-mail preferences. For security: where you are signed in (a shortened network prefix, the browser and system family such as “Chrome on Windows”, and the start and last-use time of each session), and records of sign-ins, failed sign-ins (stored as one-way hashes), password changes and account requests. If you choose **Sign in with Google**, we receive your Google name, the e-mail address Google has verified and Google’s identifier for your account; we never receive your Google password or your contacts.",
              ],
              [
                "A jobseeker who fills in the optional profile",
                "Your home city or province, highest qualification, experience level, the employment types and work arrangements you prefer, and choices from fixed lists: categories, industries, places and skills. There is no free-text field and no upload. Only you can see it.",
              ],
              [
                "A jobseeker who switches on job alerts",
                "The categories and places you chose, how often you want the e-mail (daily or weekly), the time you agreed and the version of the wording you agreed to, when you switched it off, and which listings we have already offered you.",
              ],
              [
                "An employer or authorised representative",
                "Your account details as above, plus what you tell us to support a claim to represent an organisation: your role title, a note on how we can confirm you, and optionally the organisation’s registration number and website. Staff record their decision, the method used to verify the organisation and a short evidence note. Listing and company-profile text you submit is reviewed and, once approved, shown publicly as information about the organisation.",
              ],
              [
                "A person reporting a listing",
                "The reason you choose, what you write (up to 2,000 characters), an optional web address as evidence and, only if you want to be asked a question, an e-mail address. We do not store your IP address or browser details with the report. While the report is open we keep a one-way code made from your network address, the listing and the reason, so that one person cannot fill the queue with repeats.",
              ],
              [
                "A person contacting support",
                "Your e-mail address, your message and our reply, kept in the mailbox that receives it.",
              ],
              [
                "Staff (editors and administrators)",
                "Account details, the roles granted and by whom, and a record of editorial and security actions linked to an opaque account number rather than a name.",
              ],
            ],
          },
          {
            t: "p",
            text: "Please do not include other people’s personal details in a report or a message. Staff who read it can see everything you write.",
          },
        ],
      },
      {
        id: "how-we-use-information",
        title: "3. How we use personal information and why",
        blocks: [
          {
            t: "table",
            caption: "Purposes and grounds",
            head: ["Purpose", "What it involves", "Why we are allowed to do it"],
            rows: [
              [
                "Run your account",
                "Creating and securing the account, signing you in, letting you save listings, sending the messages the account needs.",
                "It is necessary to provide the service you asked for.",
              ],
              [
                "Keep the service secure",
                "Rate limits, detecting repeated failed sign-ins, investigating abuse, keeping audit records of staff actions.",
                "Our legitimate interest in protecting the service and its users.",
              ],
              [
                "Show you opportunities",
                "Search, saved listings and, if you create a profile, the ordering described in section 4.",
                "It is necessary to provide the service, and you choose to give profile information.",
              ],
              [
                "Verify employers",
                "Deciding whether a person may post for an organisation, and recording who decided and how.",
                "Our legitimate interest in keeping fraudulent listings out, and necessary to provide employer features.",
              ],
              [
                "Moderate listings and reports",
                "Editorial review before publication, handling reports of suspicious listings, corrections and take-downs.",
                "Our legitimate interest in the accuracy and safety of what we publish.",
              ],
              [
                "Optional job alerts",
                "Sending the e-mail you asked for.",
                "Your consent, which you can withdraw at any time.",
              ],
              [
                "Support and rights requests",
                "Answering you and acting on your requests.",
                "It is necessary to respond to you and to meet our legal duties.",
              ],
              [
                "Legal and safety duties",
                "Complying with law and protecting rights.",
                "Legal obligation or legitimate interest, as the case may be.",
              ],
            ],
          },
          {
            t: "p",
            text: advertising
              ? "We do not sell your personal information and we do not send marketing messages. We do not use the information you give us (your account, profile and saved listings) for advertising; advertising on UPNEXT is described in section 6A. We do not use your information to train artificial-intelligence systems. Nothing about you is made public: listing and company text is about organisations, not about site users."
              : "We do not sell your personal information, we do not use it for advertising, and we do not send marketing messages. We do not use it to train artificial-intelligence systems. Nothing about you is made public: listing and company text is about organisations, not about site users.",
          },
          {
            t: "p",
            text: "The grounds above reflect our understanding of the Cyber and Data Protection Act [Chapter 12:07] and are reviewed whenever our processing changes.",
          },
        ],
      },
      {
        id: "recommendations",
        title: "4. Personalised recommendations (“For you”)",
        blocks: [
          {
            t: "p",
            text: "If you create a profile, UPNEXT can put the opportunities that fit it first. The ordering follows fixed, published rules: it compares your profile choices (category, place, qualification, experience level, employment type, work arrangement and skills) with what each listing states. For every listing it shows you, in plain words, which of your choices matched and which could not be compared because the listing does not say.",
          },
          {
            t: "ul",
            items: [
              "**It is not artificial intelligence, and no one makes a decision about you.** It only changes the order in which public listings appear to you. It does not rate you, reject you, or tell any employer anything.",
              "**Employers cannot see your profile.** There is no employer search of jobseekers and no employer access to profiles on UPNEXT.",
              "**The ordering is worked out when you open the page and is not stored.**",
              "**You are in control.** You can leave the profile empty, change or clear any field, reset the whole profile, or delete your account, which deletes the profile.",
            ],
          },
        ],
      },
      {
        id: "email",
        title: "5. E-mail we send",
        blocks: [
          {
            t: "p",
            text: "**Service messages.** When it is needed we send you messages about your account: confirming your e-mail address, resetting a password, security notices, and confirming that a deletion has been completed. Employer account holders also receive notices about their organisation claim and their listings (submitted, published, returned for changes, closing soon). These are not marketing and are not optional while you have the account.",
          },
          {
            t: "p",
            text: "**Job alerts are optional and off by default.** We send an alert only if you have a confirmed e-mail address, you have switched alerts on in your account, and you have ticked the separate box agreeing to receive them. Creating an account or accepting the Terms of Service never switches alerts on. You choose the categories, places and frequency (daily or weekly). Each alert lists new matching listings only, up to ten, and never repeats one. Every alert contains a link that switches alerts off in one step without signing in, and e-mail programs that support one-click unsubscribe will offer it. You can also change or stop alerts in your account at any time. We keep a record of when you agreed and to which version of the wording so that we can show your choice was respected.",
          },
          {
            t: "p",
            text: "**Delivery.** We send e-mail through a delivery provider (section 7) and only once e-mail sending has been switched on and tested. If an address is permanently refused (for example it does not exist), we remember a one-way code of it so that we do not try again; the address itself is not kept for that purpose. Mail messages contain no tracking images.",
          },
        ],
      },
      {
        id: "cookies",
        title: "6. Cookies, local storage and analytics",
        blocks: [
          {
            t: "p",
            text:
              ads === "live"
                ? "The cookies and storage in the table below are the ones the service needs to work. We do not use analytics cookies or an analytics service. Advertising is different: Google’s advertising technologies, which may set their own cookies, load only if you allow advertisements, as explained in section 6A. Those cookies are set by Google and are not listed in the table."
                : ads === "verify"
                  ? "The cookies and storage in the table below are the ones the service needs to work. We do not use advertising, tracking or analytics cookies of our own and we do not use an analytics service. The one exception is the Google script described in section 6A, which currently loads on our public pages and may use cookies or similar technologies of its own; those are set by Google and are not listed in the table."
                  : "We use only what the service needs to work. We do not use advertising, tracking or analytics cookies, and we do not use an analytics service or any third-party script that tracks you across sites. Because of that, there is no cookie banner with choices to make. If that ever changes, we will update this section and section 6A first.",
          },
          {
            t: "table",
            caption: "What is stored in your browser",
            head: ["Name", "Type", "Purpose", "Lifetime"],
            rows: [
              [
                "upnext_sid",
                "Cookie, not readable by scripts on the page",
                "Keeps you signed in after you sign in.",
                "Ends after 7 days without use or 30 days in all for jobseekers; staff sessions are shorter (30 minutes idle, 8 hours in all). Also ends when you sign out or change your password.",
              ],
              [
                "upnext_csrf",
                "Cookie",
                "Protects forms against forgery.",
                "Set when a page with a form needs it, and renewed as needed.",
              ],
              [
                "upnext-theme",
                "Local storage (not a cookie)",
                "Remembers the colour theme you choose in the page footer.",
                "Until you change it or clear your browser data. It is never sent to us.",
              ],
              ...(ads === "live"
                ? [
                    [
                      "upnext-ad-consent",
                      "Local storage (not a cookie)",
                      "Remembers whether you allowed or declined advertisements, chosen in an advertisement box.",
                      "Until you change it or clear your browser data. It is never sent to us.",
                    ],
                  ]
                : []),
            ],
          },
        ],
      },
      advertisingSection(ads),
      {
        id: "sharing",
        title: "7. Who we share information with",
        blocks: [
          {
            t: "p",
            text: "We share personal information only with organisations that help us run the service, and only what they need. They may act only on our instructions.",
          },
          {
            t: "ul",
            items: [
              "**E-mail delivery: Resend.** Our selected e-mail delivery provider. When we send you a message it receives your e-mail address and the message text. We have not made any statement that delivery works until it has been tested with real mailboxes.",
              ...(advertising
                ? [
                    "**Advertising: Google AdSense.** Described in section 6A. Google receives the technical information that its advertising technologies collect when they load; we do not give it your account information.",
                  ]
                : []),
              "**Sign in with Google (only if you choose it).** Google learns that you are signing in to UPNEXT and handles that under its own privacy policy. We receive only the name, verified e-mail address and account identifier described above.",
              "**Hosting.** The service runs on a server that we administer, supplied by a hosting provider. It holds everything described in this policy.",
              "**Backup storage.** Encrypted copies of the database may be held by a separate storage provider. Such a provider receives only encrypted files that it cannot read.",
              "**Professional advisers and authorities.** Where the law requires it, or to establish, exercise or defend legal claims, we may disclose information to the competent authority or our advisers.",
            ],
          },
          {
            t: "p",
            text: "Employers never receive your personal information through UPNEXT. When you follow an apply link you leave UPNEXT and the employer’s or source’s own website and privacy rules apply. The only thing an employer sees is an anonymous daily total of views and apply-link clicks for its own listings.",
          },
        ],
      },
      {
        id: "transfers",
        title: "8. Transfers outside Zimbabwe",
        blocks: [
          {
            t: "p",
            text: "Some of the providers in section 7, in particular the e-mail delivery provider, are based or process data outside Zimbabwe, so personal information in the messages we send through them can leave the country. The Cyber and Data Protection Act [Chapter 12:07] allows such transfers only where an adequate level of protection is ensured or another lawful route applies. We choose providers that commit to protecting the data they handle, limit what we send to what is necessary, and encrypt backups. Ask us at **support@upnext.co.zw** if you want to know which providers currently handle your information and where.",
          },
        ],
      },
      {
        id: "security",
        title: "9. How we protect information",
        blocks: [
          {
            t: "p",
            text: "No system is perfectly secure and we cannot promise that, but we take these steps:",
          },
          {
            t: "ul",
            items: [
              "Pages are served over HTTPS, and browsers are told to use HTTPS for our site.",
              "Passwords are stored only as one-way hashes. Sign-in, e-mail-link and form requests are rate limited, and repeated failures are recorded.",
              "The session cookie cannot be read by scripts on the page and is sent only over HTTPS.",
              "Staff accounts require a second step at sign-in, have short sessions, and have only the permissions their role needs. Staff actions are written to an audit record. Nobody can approve their own submission.",
              "The application’s database account cannot change the structure of the database or alter its audit records.",
              "Logs are scrubbed of passwords, links, session identifiers and e-mail addresses.",
              "Backups are encrypted and authenticated before they are stored.",
            ],
          },
          {
            t: "p",
            text: "If we become aware of a breach that affects your personal information, we will act promptly and notify the authority and affected people as the law requires.",
          },
        ],
      },
      {
        id: "retention",
        title: "10. How long we keep information",
        blocks: [
          {
            t: "table",
            caption: "Retention",
            head: ["Information", "How long"],
            rows: [
              [
                "Account details, saved listings, optional profile, job-alert choices and consent record",
                "Until you delete the account (see section 11). You can edit or clear the profile and switch off alerts at any time.",
              ],
              [
                "Sign-in sessions",
                "7 days without use or 30 days in all, or until you sign out or change your password. A record of an ended session is removed 30 days later.",
              ],
              [
                "Confirmation and password-reset links",
                "A confirmation link works once for 24 hours and a reset link once for 60 minutes. Used and expired links are removed after 7 days.",
              ],
              [
                "The e-mail address on a sent message",
                "Removed from our outbox 30 days after sending. Messages that could not be delivered are scrubbed after 90 days.",
              ],
              ["List of listings already sent in alerts", "30 days."],
              ["Daily view and apply-click totals per listing", "About twelve months, then deleted."],
              [
                "A report’s contact e-mail and repeat-prevention code",
                "Removed 30 days after the report is closed, or immediately if you delete the account that uses the same address.",
              ],
              [
                "The text of a closed report and staff notes about it",
                "Kept as a record of how the concern was handled. No fixed deletion date has been set yet; we will set one and update this policy.",
              ],
              [
                "Employer claims and verification records",
                "The details you supplied to support a claim are removed when your account is deleted. The decision, who made it and when are kept as an audit record. No fixed deletion date has been set for them.",
              ],
              [
                "Audit and security records",
                "Kept with an opaque account number and one-way hashes only; no name, e-mail address or network address. No fixed deletion date has been set yet.",
              ],
              [
                "Technical server logs (including network addresses)",
                "Kept in rolling logs of limited size that are overwritten automatically, and used only to run, protect and troubleshoot the service.",
              ],
              [
                "Encrypted backups",
                "The latest 7 daily, 4 weekly and 3 monthly copies are kept; older copies are deleted. Data you delete can therefore remain in a backup for up to about three months (see section 11).",
              ],
            ],
          },
          {
            t: "p",
            text: "Where we say no fixed date has been set, we are telling you plainly what is true today. We will decide the periods and publish them here.",
          },
        ],
      },
      {
        id: "deletion",
        title: "11. Deleting your account",
        blocks: [
          {
            t: "ol",
            items: [
              "Sign in and ask for deletion on your account page. You will be asked for your password.",
              "Your request waits **14 days** so that you can change your mind. You can cancel at any time during that period.",
              "After that, your name and e-mail address are replaced with a non-identifying placeholder, your saved listings, optional profile, job-alert settings and delivery list, sessions, unused links and two-step devices are deleted, and you can no longer sign in. The address becomes free to register again.",
              "We send one final message to the address to confirm, which is removed from our outbox like other sent messages.",
            ],
          },
          {
            t: "p",
            text: "**What remains.** A blank placeholder row for the account (other records refer to it), audit records that carry only an opaque number, and the history of decisions on any organisation you represented. If your account held staff access, an administrator must remove that access first. **Backups:** deleted data can remain in an encrypted backup until that backup’s turn to be deleted, up to about three months. A backup is used only to restore the service after a failure, and if one is ever restored we carry out completed deletions again before the service reopens.",
          },
          {
            t: "p",
            text: "If you cannot sign in, write to **support@upnext.co.zw** from the address on the account and we will help after checking it is you.",
          },
        ],
      },
      {
        id: "your-rights",
        title: "12. Your rights",
        blocks: [
          {
            t: "p",
            text: "Under the Cyber and Data Protection Act [Chapter 12:07] you have rights over your personal information, including the rights to access it, to have inaccurate information corrected and to have it deleted. We also let you object to our use of it, as set out below. In practice:",
          },
          {
            t: "ul",
            items: [
              "**Access.** Write to support@upnext.co.zw from your account’s address. We will send you a copy of what we hold about you in a readable form after checking it is you. There is no self-service download yet.",
              "**Correction.** Change your name and profile yourself in your account; for anything else, write to us.",
              "**Deletion.** As described in section 11.",
              "**Objection and withdrawal.** You can object to processing based on our legitimate interests by writing to us, and withdraw your consent to job alerts at any time in your account or with the link in any alert.",
              "**Complaints.** Please contact us first so that we can put things right. You may also complain to the Postal and Telecommunications Regulatory Authority of Zimbabwe (POTRAZ), which is the data protection authority under the Act.",
            ],
          },
          {
            t: "p",
            text: "We answer requests without undue delay and will tell you if we need more time or cannot do what you ask, and why. We may need to confirm your identity first, and we will not give your information to anyone else.",
          },
        ],
      },
      {
        id: "children",
        title: "13. Eligibility and children",
        blocks: [
          {
            t: "p",
            text: "Accounts are for people aged **18 or over**. Anyone can read public listings without an account, but we do not knowingly create accounts for, or collect profile information from, anyone under 18. If you believe a child has an account, write to us and we will delete it.",
          },
        ],
      },
      {
        id: "changes",
        title: "14. Changes to this policy",
        blocks: [
          {
            t: "p",
            text: "When we change this policy we change the version number and the dates at the top of the page and add a line to the version history below. For a material change that affects how we use account holders’ information, we will also give notice on the site and, where e-mail sending is operating, by e-mail before the change takes effect. Earlier versions are available on request.",
          },
        ],
      },
      {
        id: "contact",
        title: "15. Contact",
        blocks: [
          {
            t: "p",
            text: "Zentrik Solutions (Pvt) Ltd, Zimbabwe. Privacy requests and support: **support@upnext.co.zw**. General enquiries and corrections: **info@upnext.co.zw**. Website: https://upnext.co.zw.",
          },
        ],
      },
    ],
  };
}

/** The policy for the default status (no advertising). The page uses `privacyFor(adsenseMode())`. */
export const PRIVACY: LegalDocument = privacyFor("off");
