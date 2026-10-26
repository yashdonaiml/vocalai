import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SectionTitle, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BusinessProfileReadiness, BusinessProfileV1 } from "@/lib/business-profile";
import { getBusinessProfile, saveBusinessProfile } from "@/lib/business-profile.functions";

const days = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
] as const;
const starterWeek = () => ({
  mon: [{ open: "09:00", close: "17:00" }],
  tue: [{ open: "09:00", close: "17:00" }],
  wed: [{ open: "09:00", close: "17:00" }],
  thu: [{ open: "09:00", close: "17:00" }],
  fri: [{ open: "09:00", close: "17:00" }],
  sat: [],
  sun: [],
});

export function BusinessProfileEditor({
  workspaceId,
  setupId,
  fallbackName,
  fallbackDescription,
  disabled,
  onReadiness,
  onSaved,
}: {
  workspaceId: string;
  setupId: string;
  fallbackName: string;
  fallbackDescription: string;
  disabled: boolean;
  onReadiness: (readiness: BusinessProfileReadiness) => void;
  onSaved: (profile: BusinessProfileV1) => void | Promise<void>;
}) {
  const getProfile = useServerFn(getBusinessProfile);
  const saveProfile = useServerFn(saveBusinessProfile);
  const qc = useQueryClient();
  const queryKey = ["business-profile", workspaceId, setupId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => getProfile({ data: { workspaceId, setupId } }),
  });
  const [profile, setProfile] = useState<BusinessProfileV1 | null>(null);
  const [services, setServices] = useState("");
  const [claims, setClaims] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data || profile) return;
    const loaded = query.data.profile ?? {
      version: 1,
      business: {
        name: fallbackName || "My business",
        description: fallbackDescription || undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        language: "en" as const,
      },
      services: [],
      hours: { mode: "not_provided" as const },
      escalation: { mode: "take_message" as const },
      prohibitedClaims: [],
    };
    setProfile(loaded);
    setServices(loaded.services.map((service) => service.name).join("\n"));
    setClaims(loaded.prohibitedClaims.join("\n"));
    onReadiness(query.data.readiness);
  }, [fallbackDescription, fallbackName, onReadiness, profile, query.data]);

  if (query.isLoading || !profile) return <p role="status">Loading business details…</p>;
  if (query.error)
    return (
      <p role="alert" className="text-sm text-warning">
        Business details could not be loaded.
      </p>
    );

  async function save() {
    if (!query.data || !profile) return;
    const serviceNames = services
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    const next: BusinessProfileV1 = {
      ...profile,
      services: serviceNames.map((name, index) => ({ id: `service_${index + 1}`, name })),
      prohibitedClaims: claims
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
    };
    setBusy(true);
    setMessage(null);
    try {
      const saved = await saveProfile({
        data: { workspaceId, setupId, expectedRevision: query.data.revision, profile: next },
      });
      qc.setQueryData(queryKey, saved);
      setProfile(saved.profile);
      onReadiness(saved.readiness);
      await onSaved(saved.profile);
      setMessage("Saved. You can continue later.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save these details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <SectionTitle
          title="Business"
          subtitle="Add only facts the assistant may share with callers."
        />
        <label className="block text-sm">
          Business name
          <Input
            className="mt-1.5"
            value={profile.business.name}
            disabled={disabled}
            onChange={(event) =>
              setProfile({
                ...profile,
                business: { ...profile.business, name: event.target.value },
              })
            }
          />
        </label>
        <label className="block text-sm">
          What does the business do?
          <Textarea
            className="mt-1.5"
            rows={4}
            value={profile.business.description ?? ""}
            disabled={disabled}
            onChange={(event) =>
              setProfile({
                ...profile,
                business: { ...profile.business, description: event.target.value || undefined },
              })
            }
          />
        </label>
        <label className="block text-sm">
          Services offered
          <Textarea
            className="mt-1.5"
            rows={4}
            value={services}
            disabled={disabled}
            onChange={(event) => setServices(event.target.value)}
            placeholder={"Appliance repair\nAnnual maintenance"}
          />
          <span className="mt-1 block text-xs text-muted-foreground">One service per line.</span>
        </label>
        <label className="block text-sm">
          Business timezone
          <Input
            className="mt-1.5"
            value={profile.business.timezone}
            disabled={disabled}
            onChange={(event) =>
              setProfile({
                ...profile,
                business: { ...profile.business, timezone: event.target.value },
              })
            }
          />
        </label>
        <label className="block text-sm">
          Business hours
          <select
            className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={profile.hours.mode}
            disabled={disabled}
            onChange={(event) =>
              setProfile({
                ...profile,
                hours:
                  event.target.value === "always_open"
                    ? { mode: "always_open" }
                    : event.target.value === "schedule"
                      ? { mode: "schedule", weekly: starterWeek() }
                      : { mode: "not_provided" },
              })
            }
          >
            <option value="not_provided">Not provided</option>
            <option value="always_open">Open 24 hours</option>
            <option value="schedule">Weekly schedule</option>
          </select>
        </label>
        {profile.hours.mode === "schedule" && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            {days.map(([day, label]) => {
              const range =
                profile.hours.mode === "schedule" ? profile.hours.weekly[day][0] : undefined;
              const updateDay = (next: { open: string; close: string }[]) => {
                if (profile.hours.mode !== "schedule") return;
                setProfile({
                  ...profile,
                  hours: { mode: "schedule", weekly: { ...profile.hours.weekly, [day]: next } },
                });
              };
              return (
                <div
                  key={day}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-sm"
                >
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!range}
                      disabled={disabled}
                      onChange={(event) =>
                        updateDay(event.target.checked ? [{ open: "09:00", close: "17:00" }] : [])
                      }
                    />
                    {label}
                  </label>
                  <Input
                    type="time"
                    aria-label={`${label} opens`}
                    disabled={disabled || !range}
                    value={range?.open ?? "09:00"}
                    onChange={(event) =>
                      updateDay([{ open: event.target.value, close: range?.close ?? "17:00" }])
                    }
                  />
                  <Input
                    type="time"
                    aria-label={`${label} closes`}
                    disabled={disabled || !range}
                    value={range?.close ?? "17:00"}
                    onChange={(event) =>
                      updateDay([{ open: range?.open ?? "09:00", close: event.target.value }])
                    }
                  />
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">Times use the business timezone above.</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Language: English. More languages will appear only after they can be tested end to end.
        </p>
      </section>
      <section className="space-y-4 border-t border-border pt-5">
        <SectionTitle
          title="Behavior"
          subtitle="Set safe boundaries and what should happen when a person needs follow-up."
        />
        <div className="rounded-lg border border-border p-3 text-sm">
          <SystemLabel tone="ok">Available</SystemLabel>
          <p className="mt-2 font-medium">Take a message for my team</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The assistant saves the request for manual review. It will not promise a callback time.
          </p>
        </div>
        <label className="block text-sm">
          Message-taking guidance <span className="text-muted-foreground">(optional)</span>
          <Textarea
            className="mt-1.5"
            rows={3}
            value={profile.escalation.instructions ?? ""}
            disabled={disabled}
            onChange={(event) =>
              setProfile({
                ...profile,
                escalation: { mode: "take_message", instructions: event.target.value || undefined },
              })
            }
          />
        </label>
        <label className="block text-sm">
          Claims the assistant must never make{" "}
          <span className="text-muted-foreground">(optional)</span>
          <Textarea
            className="mt-1.5"
            rows={3}
            value={claims}
            disabled={disabled}
            onChange={(event) => setClaims(event.target.value)}
            placeholder={"We guarantee same-day service\nWe are the cheapest"}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            One prohibited claim per line.
          </span>
        </label>
      </section>
      <Button type="button" disabled={disabled || busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save business and behavior"}
      </Button>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
