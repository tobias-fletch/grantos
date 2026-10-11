/** Link-only resources checked against their publishers on 2026-10-11.
 * Descriptions are original editorial annotations, never imported proposal prose. */
export type WritingResource = {
  id: string; title: string; url: string; publisher: string; audience: string;
  badge: string; period: string; learnFrom: string; limitations: string; rightsNote: string;
  verifiedAt: string; companion?: {title: string; url: string};
};
export const writingResourceCatalog: WritingResource[] = [
  {
    id:'niaid',title:'NIAID sample applications and reviewer feedback',publisher:'NIH / NIAID',
    url:'https://beta.nih.gov/niaid/funding/sample-applications',audience:'Research and research-based small business',
    badge:'Funded applications + reviewer feedback',period:'Historical applications across multiple funding mechanisms',verifiedAt:'2026-10-11',
    learnFrom:'Compare the aims, evidence, methods and feasibility argument with reviewer feedback. Look for how claims are supported.',
    limitations:'Released application PDFs and summary statements are historical examples, not current forms or a template for this opportunity.',
    rightsNote:'Link-only. Applicant text is copyrighted; NIAID’s permission is limited to unchanged nonprofit educational use with attribution. Do not import or adapt proposal text.',
    companion:{title:'NIH review framework for covered mechanisms',url:'https://grants.nih.gov/policy-and-compliance/policy-topics/peer-review/simplifying-review/framework'},
  },
  {
    id:'nea',title:'NEA funded arts-research narratives',publisher:'National Endowment for the Arts',
    url:'https://www.arts.gov/sites/default/files/SampleNarratives-ORA-August2018.pdf',audience:'Arts organizations, arts research and nonprofits',
    badge:'Funded narrative excerpts',period:'Historical Research: Art Works awards; released August 2018',verifiedAt:'2026-10-11',
    learnFrom:'Connect a research gap, a precise question, participants or data, a method and the intended contribution.',
    limitations:'These are narrative sections, not complete applications. NEA says they are references, not templates or evidence of relative ranking. Guidelines have changed.',
    rightsNote:'Link-only. Public release does not establish permission to reproduce applicant-authored prose.',
    companion:{title:'NEA Grants for Arts Projects preparation tools (a different program)',url:'https://www.arts.gov/grants/grants-for-arts-projects/applicant-resources'},
  },
  {
    id:'njit',title:'Successful community-grant application samples',publisher:'NJIT Technical Assistance to Brownfield Communities',
    url:'https://www.njit.edu/tab/sample-grant-applications',audience:'Community organizations, nonprofits and local governments',
    badge:'Publisher-labeled successful applications',period:'Historical brownfields-grant samples, including FY2023–FY2025',verifiedAt:'2026-10-11',
    learnFrom:'Organize answers under the exact numbered questions. Connect place-specific evidence, community needs, partners and planned work.',
    limitations:'The publisher identifies these as successful samples. Documents may include narrative and supporting material rather than a complete electronic submission. Environmental-grant rules do not transfer to other programs.',
    rightsNote:'Link-only. No general adaptation license was verified; do not reproduce contact information or signatures.',
  },
  {
    id:'nyfa',title:'NYSCA / NYFA artist fellowship history',publisher:'New York Foundation for the Arts',
    url:'https://www.nyfa.org/grant-history/nysca-nyfa-artist-fellowship/',audience:'Individual artists',
    badge:'Awardee directory, not applications',period:'Historical fellows, finalists and panelists by year and discipline',verifiedAt:'2026-10-11',
    learnFrom:'Explore the range of supported artistic practices while selecting work samples that express your own artistic voice.',
    limitations:'Check each person’s listed role: finalists and panelists are not awardees. Recipient records and public portfolios do not reveal submitted wording, scores or selection reasons. This fellowship is not a project grant.',
    rightsNote:'Link-only. No permission to reproduce artwork, photographs or applicant prose was verified.',
    companion:{title:'NYFA’s fellowship and review information',url:'https://www.nyfa.org/awards-grants/nysca-nyfa-artist-fellowship/'},
  },
  {
    id:'nsf',title:'NSF award abstracts',publisher:'National Science Foundation',
    url:'https://www.nsf.gov/funding/award-search',audience:'Research and technology businesses',
    badge:'Funded project abstracts, not proposals',period:'Historical award database',verifiedAt:'2026-10-11',
    learnFrom:'Study concise explanations of a technical problem, an innovation and potential public benefit, then use your own evidence.',
    limitations:'NSF publishes award abstracts; proposals remain the submitting organizations’ confidential intellectual property. Similar wording does not imply a higher chance of funding.',
    rightsNote:'NSF identifies award data, including abstracts, as public domain. Linked papers can have separate rights. This library links to the source.',
    companion:{title:'NSF merit-review information',url:'https://www.nsf.gov/funding/merit-review'},
  },
  {
    id:'candid',title:'Nonprofit proposal structures and samples',publisher:'Candid',
    url:'https://candid.org/blogs/four-common-examples-grant-proposal-documents-free-samples-included/',audience:'Nonprofits and foundation applicants',
    badge:'Writing guide + sample documents',period:'Guide published July 2023',verifiedAt:'2026-10-11',
    learnFrom:'Keep the statement of need, activities, organizational capacity and funding request consistent. Reconcile narrative amounts with the budget.',
    limitations:'Award provenance for every linked sample was not verified. Candid is a grantseeker-support organization, not this funder or a universal scoring rubric. Linked sample access may vary.',
    rightsNote:'Link-only; the publisher reserves rights.',
  },
];
