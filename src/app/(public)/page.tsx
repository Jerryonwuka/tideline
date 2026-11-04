import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-4 py-16">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">{t("home.status")}</p>
        <h1 className="text-4xl font-semibold tracking-tight">{t("app.name")}</h1>
        <p className="text-lg text-muted-foreground">{t("app.tagline")}</p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2" aria-label={t("home.title")}>
        <Card>
          <CardHeader>
            <CardTitle>{t("home.ferryTitle")}</CardTitle>
            <CardDescription>{t("home.ferryBody")}</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("home.charterTitle")}</CardTitle>
            <CardDescription>{t("home.charterBody")}</CardDescription>
          </CardHeader>
        </Card>
      </section>
      <div>
        <Button size="lg" disabled>
          {t("home.getStarted")}
        </Button>
      </div>
    </main>
  );
}
