const categories = [
  "Nonprofit",
  "Music",
  "Visual Art",
  "Film / Video",
  "Theater",
  "Dance",
  "Writing / Literature",
  "Photography",
  "Research",
  "Education",
  "Community Project",
  "Small Business",
  "Technology",
  "Agriculture / Food",
];

export default function Onboarding() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="font-bold">GrantOS</p>
      <p className="mt-12 text-sm text-[var(--muted)]">STEP 1 OF 3</p>
      <h1 className="mt-2 text-4xl font-semibold">What are you seeking funding for?</h1>
      <p className="mt-3 text-[var(--muted)]">
        Choose as many as apply. We’ll use these to personalize your funding feed.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
        {categories.map((category) => (
          <button
            key={category}
            className="rounded-xl border bg-white p-4 text-left hover:border-[var(--brand)]"
          >
            {category}
          </button>
        ))}
      </div>
      <button className="mt-8 rounded-xl bg-[var(--brand)] px-6 py-3 font-semibold text-white">
        Continue
      </button>
    </main>
  );
}
