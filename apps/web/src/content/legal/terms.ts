import type { LegalDocument } from "./types";

export const TERMS: LegalDocument = {
  slug: "terms",
  title: "Terms of Service",
  description:
    "The rules for using UPNEXT Careers: accounts, listings, employers, scams, acceptable use, liability and disputes.",
  intro:
    "These terms are the agreement between you and the operator of UPNEXT Careers. They are short on legal ritual and long on the things that matter to jobseekers and employers: honest listings, no fees to apply, and no guarantees we cannot keep.",
  version: "1.0",
  effective: "2026-10-29",
  updated: "2026-10-29",
  history: [
    { version: "1.0", effective: "2026-10-29", summary: "First full version of the Terms of Service." },
  ],
  sections: [
    {
      id: "acceptance",
      title: "1. Acceptance and who we are",
      blocks: [
        {
          t: "p",
          text: "UPNEXT Careers (**UPNEXT**, **we**, **us**) at https://upnext.co.zw is operated by **Zentrik Solutions (Pvt) Ltd**, Zimbabwe. By using the website or creating an account you agree to these terms and acknowledge our [Privacy Policy](/privacy). If you do not agree, please do not use the service. If you use UPNEXT on behalf of an organisation, you confirm that you may bind it to these terms.",
        },
        {
          t: "p",
          text: "Browsing public listings does not need an account. Some parts of these terms matter only if you have an account or act for an employer.",
        },
      ],
    },
    {
      id: "eligibility",
      title: "2. Eligibility",
      blocks: [
        {
          t: "p",
          text: "To create an account you must be at least **18 years old** and able to enter a binding agreement. Younger visitors may read public listings without an account.",
        },
      ],
    },
    {
      id: "accounts",
      title: "3. Your account",
      blocks: [
        {
          t: "ul",
          items: [
            "Give accurate details, keep them up to date and confirm your e-mail address when asked.",
            "One account is for one person. Keep your password to yourself and use a password you use nowhere else.",
            "You are responsible for what happens under your account. Tell us promptly at support@upnext.co.zw if you think someone else has used it.",
            "You can delete your account at any time from your account page. The Privacy Policy explains what happens to your information.",
          ],
        },
      ],
    },
    {
      id: "service",
      title: "4. What UPNEXT does and does not do",
      blocks: [
        {
          t: "p",
          text: "UPNEXT is a listing and discovery service. Opportunities are published by or on behalf of other organisations, and each shows its source. Our editors review each opportunity before it is published, and we label what we checked. We do not employ, award, fund or recruit anyone ourselves, we are not a party to any application, and **we do not receive applications**: to apply, you use the link to the employer’s or issuer’s own process.",
        },
        {
          t: "p",
          text: "With an account you can save opportunities, set an optional profile used to order listings for you, and, if you choose, receive job alerts. Employers can claim and manage an organisation and submit listings for review. UPNEXT does not currently charge any fees, offer subscriptions or payments, hold candidate documents or let employers search or view jobseeker profiles.",
        },
      ],
    },
    {
      id: "jobseekers",
      title: "5. If you are a jobseeker",
      blocks: [
        {
          t: "ul",
          items: [
            "Check every opportunity with the source before relying on it or sharing documents. A listing can be out of date or wrong even after review.",
            "Do not pay to apply. See section 10.",
            "Give true information in your profile and in any report you make.",
            "Optional job alerts are sent only if you switch them on and agree separately. Accepting these terms never subscribes you to anything.",
          ],
        },
      ],
    },
    {
      id: "employers",
      title: "6. If you are an employer",
      blocks: [
        {
          t: "p",
          text: "Any account can ask to represent an organisation. Your authority to post comes only from an approved claim: our staff review what you provide, and we may ask for more, refuse the claim or withdraw approval. You promise that you are authorised to act for the organisation, that the details you give are true, and that you will tell us at once if your authority ends. Employer accounts may be shared only through the organisation’s own members list, never by sharing a password.",
        },
        {
          t: "p",
          text: "**Verification has limits.** An approved claim means we were satisfied, on the evidence we saw at the time, that you may act for the organisation. It is not a guarantee about the organisation, its listings, its integrity or its offers, and it does not mean that UPNEXT endorses it.",
        },
      ],
    },
    {
      id: "submitting-opportunities",
      title: "7. Submitting opportunities and editorial approval",
      blocks: [
        {
          t: "ul",
          items: [
            "Every opportunity is reviewed by an editor other than the person who prepared it before it is published. A person cannot approve their own submission.",
            "A material change to a published listing is reviewed again before it replaces the earlier version.",
            "We may edit, refuse, return for changes, suspend or take down a listing, or remove it after publication, for any reason in these terms, including doubts about accuracy or safety. We are not obliged to publish anything.",
            "Publishing is not an endorsement, and a labelled check is a statement of what we checked, not a guarantee.",
          ],
        },
      ],
    },
    {
      id: "accuracy",
      title: "8. Accuracy and what employers must provide",
      blocks: [
        {
          t: "p",
          text: "If you submit a listing you promise that it is genuine, current and lawful; that a real vacancy, award or tender exists; that the employer or issuer, the role, location, deadline, pay or benefits (where stated) and the way to apply are accurately described; and that you will update or withdraw the listing when something changes or the opportunity closes. Do not submit anything you are not entitled to publish.",
        },
      ],
    },
    {
      id: "prohibited",
      title: "9. Fraudulent, discriminatory and other prohibited conduct",
      blocks: [
        { t: "p", text: "You must not use UPNEXT to:" },
        {
          t: "ul",
          items: [
            "post a fake, misleading or already-filled opportunity, or one whose real purpose is something other than the stated opportunity, such as collecting data, selling services or recruiting for a scheme;",
            "impersonate a person or organisation, or claim an authority you do not have;",
            "post or apply discriminatory requirements or treatment that the law of Zimbabwe forbids, for example on grounds such as race, colour, gender, marital status, disability, religion, tribe, place of origin or political opinion;",
            "post unlawful, abusive, defamatory or obscene content, or content that infringes someone else’s rights;",
            "ask people for money, identity documents, bank or card details, or passwords as a condition of applying;",
            "send spam, or use the service to harass anyone.",
          ],
        },
      ],
    },
    {
      id: "scams",
      title: "10. Recruitment scams and requests for payment",
      blocks: [
        {
          t: "p",
          text: "**A genuine job, internship, scholarship or grant does not ask applicants to pay.** We do not list opportunities that ask applicants for a fee, and a tender notice may at most carry a published, official price for its documents. If anyone, including someone using our name, asks you for money, a deposit, an “admin” or “training” fee, or sensitive documents before a real process has begun, do not pay, stop communicating and tell us.",
        },
        {
          t: "p",
          text: "UPNEXT will never ask you for a payment or for your password. Report anything suspicious using **Report this opportunity** on the listing, or write to support@upnext.co.zw. Employers who breach this section lose access and may be reported to the authorities.",
        },
      ],
    },
    {
      id: "external",
      title: "11. External applications and other websites",
      blocks: [
        {
          t: "p",
          text: "Apply and source links lead to websites we do not control. Their content, privacy practices and terms are theirs, and we are not responsible for them. Applying happens entirely there. Take care before sharing personal documents and check that the site belongs to the employer named.",
        },
      ],
    },
    {
      id: "no-guarantee",
      title: "12. No guarantee of employment or outcomes",
      blocks: [
        {
          t: "p",
          text: "UPNEXT does not promise that you will find work, be shortlisted, win a scholarship, grant or tender, or hear from anyone. We do not control employers’ decisions. Ordering by the “For you” feature reflects how a listing matches your profile choices; it is not an assessment of your suitability and does not improve your chances with an employer.",
        },
      ],
    },
    {
      id: "ip",
      title: "13. Intellectual property",
      blocks: [
        {
          t: "p",
          text: "The UPNEXT name, logo, design and software belong to the operator or its licensors, and you may not copy or reuse them except as these terms allow. Listings summarise information published by their sources; the rights in the original notices remain with their owners. You may use the site for your own personal job search and may share links to listings. Please do not copy it as a whole.",
        },
      ],
    },
    {
      id: "your-content",
      title: "14. Content you submit",
      blocks: [
        {
          t: "p",
          text: "You keep the rights in what you submit (listing and company-profile text, reports and messages). By submitting it you give the operator a non-exclusive, royalty-free licence to store, review, edit for clarity and format, and display it as needed to run the service, and to keep a record of it as these terms and the Privacy Policy describe. For company text, that includes showing it publicly once approved. You confirm that you have the right to give that licence and that your content does not breach anyone’s rights or the law.",
        },
      ],
    },
    {
      id: "abuse",
      title: "15. Scraping, abuse and unauthorised access",
      blocks: [
        {
          t: "ul",
          items: [
            "Do not use automated tools to collect listings or accounts in bulk beyond what the site’s limits allow, or to overload, probe or interfere with the service.",
            "Do not try to access accounts, systems or data that are not yours, bypass limits or security, or test the service’s security without our written permission.",
            "If you find a security problem, please tell us at info@upnext.co.zw and give us reasonable time to fix it before telling others.",
          ],
        },
      ],
    },
    {
      id: "reporting",
      title: "16. Reporting suspicious opportunities",
      blocks: [
        {
          t: "p",
          text: "Anyone can report a listing, with or without an account, using **Report this opportunity** on the listing page. Staff review reports. A report never removes a listing automatically, and we may not be able to tell you the outcome. Do not make a report that you know to be false.",
        },
      ],
    },
    {
      id: "suspension",
      title: "17. Suspension and termination",
      blocks: [
        {
          t: "p",
          text: "We may suspend or end your access, or remove content, if you breach these terms, if we reasonably believe your use is unlawful, fraudulent or unsafe for others, or if the law requires. Where we reasonably can, we will tell you why and give you a way to respond by writing to support@upnext.co.zw. You may stop using UPNEXT and delete your account at any time. Sections that by their nature should continue, such as those on liability, intellectual property and disputes, continue after you leave.",
        },
      ],
    },
    {
      id: "privacy",
      title: "18. Privacy and personal information",
      blocks: [
        {
          t: "p",
          text: "How we handle personal information is explained in the [Privacy Policy](/privacy), which forms part of these terms. Nothing in these terms switches on any optional e-mail.",
        },
      ],
    },
    {
      id: "availability",
      title: "19. Availability and changes to the service",
      blocks: [
        {
          t: "p",
          text: "We aim to keep UPNEXT available but do not promise that it will be uninterrupted, error-free or that listings will always be current. We may change, suspend or stop features, with reasonable notice where practicable, for example for maintenance, security or legal reasons.",
        },
      ],
    },
    {
      id: "liability",
      title: "20. Disclaimers and limits on liability",
      blocks: [
        {
          t: "p",
          text: "UPNEXT is provided “as is” and “as available”. To the extent the law allows, we do not give warranties about the accuracy, completeness or reliability of listings, and we are not responsible for the actions of employers, issuers or other users, or for any dealings you have with them. We are not liable for losses that result from your relying on a listing or from a third-party site, nor for indirect or consequential loss, loss of opportunity or loss of profit. Our total liability to you for any claim about the service is limited to the amount you paid us for it, which is nothing as the service is free to use.",
        },
        {
          t: "p",
          text: "Nothing in these terms limits any liability that cannot lawfully be limited, including for fraud, or affects any rights you have under the Consumer Protection Act [Chapter 14:44] or other law that cannot be excluded.",
        },
      ],
    },
    {
      id: "disputes",
      title: "21. Disputes and governing law",
      blocks: [
        {
          t: "p",
          text: "If you have a complaint, write to us first at support@upnext.co.zw and we will try to resolve it in good faith. These terms are governed by the laws of Zimbabwe, and the courts of Zimbabwe have jurisdiction over any dispute about them, without affecting any right you have to approach a regulator.",
        },
      ],
    },
    {
      id: "changes",
      title: "22. Changes to these terms",
      blocks: [
        {
          t: "p",
          text: "We may update these terms. When we do we change the version and dates at the top of the page and add to the version history below. For a material change we will give account holders notice on the site and, where e-mail sending is operating, by e-mail before it takes effect. If you keep using UPNEXT after the effective date you accept the new terms; if you do not agree, you can delete your account.",
        },
      ],
    },
    {
      id: "contact",
      title: "23. Contact",
      blocks: [
        {
          t: "p",
          text: "Zentrik Solutions (Pvt) Ltd, Zimbabwe. Support and privacy: **support@upnext.co.zw**. General enquiries and corrections: **info@upnext.co.zw**. Website: https://upnext.co.zw.",
        },
      ],
    },
  ],
};
