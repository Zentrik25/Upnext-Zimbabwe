"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormError, FormSuccess } from "@/components/account/parts";
import { Button, Field, Select } from "@/components/ui";
import { apiFetch, describeFailure, type FieldErrors } from "@/lib/client-api";
import type { Category, Location, Sector } from "@/lib/catalog-types";
import {
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  QUALIFICATIONS,
  WORK_ARRANGEMENTS,
  type SeekerProfile,
} from "@/lib/seeker-types";
import { CheckboxGroup } from "./checkbox-group";
import { SkillPicker, type PickedSkill } from "./skill-picker";

type Pending = "reset" | "delete" | null;

/** Every field is optional and nothing here is shown to anyone but the person who owns the profile. */
export function ProfileForm({
  profile,
  categories,
  sectors,
  locations,
}: {
  profile: SeekerProfile;
  categories: Category[];
  sectors: Sector[];
  locations: Location[];
}) {
  const router = useRouter();
  const [home, setHome] = useState(profile.home_location?.id ?? "");
  const [qualification, setQualification] = useState<string>(profile.highest_qualification ?? "");
  const [experience, setExperience] = useState(profile.experience_level ?? "");
  const [skills, setSkills] = useState<PickedSkill[]>(profile.skills);
  const [categoryCodes, setCategoryCodes] = useState(profile.categories.map((c) => c.code));
  const [sectorIds, setSectorIds] = useState(profile.sectors.map((s) => s.id));
  const [placeIds, setPlaceIds] = useState(profile.preferred_locations.map((l) => l.id));
  const [types, setTypes] = useState(profile.employment_types);
  const [modes, setModes] = useState(profile.work_arrangements);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState<Pending>(null);

  const homeOptions = locations.filter((l) => l.kind === "city" || l.kind === "province");
  const placeOptions = locations.map((l) => ({ value: l.id, label: l.name }));

  function load(next: SeekerProfile) {
    setHome(next.home_location?.id ?? "");
    setQualification(next.highest_qualification ?? "");
    setExperience(next.experience_level ?? "");
    setSkills(next.skills);
    setCategoryCodes(next.categories.map((c) => c.code));
    setSectorIds(next.sectors.map((s) => s.id));
    setPlaceIds(next.preferred_locations.map((l) => l.id));
    setTypes(next.employment_types);
    setModes(next.work_arrangements);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setFailure(null);
    setErrors({});
    const outcome = await apiFetch<SeekerProfile>("PATCH", "me/profile", {
      home_location: home || null,
      highest_qualification: qualification || null,
      experience_level: experience || null,
      skills: skills.map((s) => s.id),
      categories: categoryCodes,
      sectors: sectorIds,
      preferred_locations: placeIds,
      employment_types: types,
      work_arrangements: modes,
    });
    setBusy(false);
    if (outcome.ok) {
      load(outcome.data);
      setMessage("Profile saved. Your For you page now uses it.");
      router.refresh();
    } else if (outcome.code === "validation_failed") {
      setErrors(outcome.fields);
      setFailure("Check the highlighted fields.");
    } else setFailure(describeFailure(outcome));
  }

  async function confirm(action: "reset" | "delete") {
    setBusy(true);
    setMessage(null);
    setFailure(null);
    const outcome =
      action === "reset"
        ? await apiFetch<SeekerProfile>("POST", "me/profile/reset-preferences")
        : await apiFetch("DELETE", "me/profile");
    setBusy(false);
    setPending(null);
    if (!outcome.ok) return setFailure(describeFailure(outcome));
    if (action === "reset") {
      load(outcome.data as SeekerProfile);
      setMessage("Preferences cleared. Your details above were kept.");
    } else {
      load({
        ...profile,
        home_location: null,
        highest_qualification: null,
        experience_level: null,
        skills: [],
        categories: [],
        sectors: [],
        preferred_locations: [],
        employment_types: [],
        work_arrangements: [],
      });
      setMessage("Your profile was deleted. Nothing is kept.");
    }
    router.refresh();
  }

  return (
    <form onSubmit={save} className="grid max-w-[760px] gap-6" aria-describedby="profile-privacy">
      {failure ? <FormError>{failure}</FormError> : null}
      {message ? <FormSuccess>{message}</FormSuccess> : null}

      <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
        <legend className="p-0 text-title font-strong">About you</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="home" label="Where you live" error={errors.home_location?.[0]}>
            <Select id="home" value={home} onChange={(e) => setHome(e.target.value)}>
              <option value="">Not set</option>
              {homeOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="qualification" label="Highest qualification" error={errors.highest_qualification?.[0]}>
            <Select
              id="qualification"
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
            >
              <option value="">Not set</option>
              {QUALIFICATIONS.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="experience" label="Experience" error={errors.experience_level?.[0]}>
            <Select id="experience" value={experience} onChange={(e) => setExperience(e.target.value)}>
              <option value="">Not set</option>
              {EXPERIENCE_LEVELS.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <SkillPicker value={skills} onChange={setSkills} />
        {errors.skills ? (
          <p role="alert" className="text-small text-urgent">
            <span className="font-strong">Error:</span> {errors.skills[0]}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="m-0 grid min-w-0 gap-5 border-0 p-0">
        <legend className="p-0 text-title font-strong">What you are looking for</legend>
        <CheckboxGroup
          name="categories"
          legend="Categories"
          options={categories.map((c) => ({ value: c.code, label: c.name }))}
          selected={categoryCodes}
          onChange={setCategoryCodes}
          max={6}
        />
        <CheckboxGroup
          name="sectors"
          legend="Industries"
          options={sectors.map((s) => ({ value: s.id, label: s.name }))}
          selected={sectorIds}
          onChange={setSectorIds}
          max={10}
        />
        <CheckboxGroup
          name="employment_types"
          legend="Employment types"
          options={EMPLOYMENT_TYPES}
          selected={types}
          onChange={setTypes}
        />
        <CheckboxGroup
          name="work_arrangements"
          legend="Where the work is done"
          hint="Include remote if you are happy to work remotely."
          options={WORK_ARRANGEMENTS}
          selected={modes}
          onChange={setModes}
        />
        <CheckboxGroup
          name="preferred_locations"
          legend="Places you would work"
          options={placeOptions}
          selected={placeIds}
          onChange={setPlaceIds}
          max={10}
        />
      </fieldset>

      <p id="profile-privacy" className="max-w-[640px] text-small text-muted" data-testid="profile-privacy">
        Only you can see this. Employers cannot browse it and nothing here is public. It is used to order
        opportunities for you and nothing else. Every field is optional.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          Save profile
        </Button>
        <Button variant="secondary" onClick={() => setPending("reset")} disabled={busy}>
          Reset preferences
        </Button>
        <Button variant="secondary" onClick={() => setPending("delete")} disabled={busy || !profile.exists}>
          Delete profile
        </Button>
      </div>
      {pending ? (
        <div
          role="alertdialog"
          aria-labelledby="confirm-title"
          className="max-w-[640px] rounded-card border border-border-strong p-3"
        >
          <p id="confirm-title" className="text-base font-strong">
            {pending === "reset" ? "Clear your preferences?" : "Delete your whole profile?"}
          </p>
          <p className="mt-1 text-small text-muted">
            {pending === "reset"
              ? "Categories, industries, places, employment types and where the work is done are cleared. The details at the top stay."
              : "Everything above is removed from NextJob. Your account, saved opportunities and alerts are not affected."}
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => confirm(pending)} disabled={busy}>
              {pending === "reset" ? "Yes, clear preferences" : "Yes, delete my profile"}
            </Button>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
